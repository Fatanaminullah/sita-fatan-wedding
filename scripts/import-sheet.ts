// scripts/import-sheet.ts
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { config as loadEnv } from 'dotenv'
import * as XLSX from 'xlsx'
import { getAdminSupabase } from '../src/server/supabase/admin-client'
import {
  requiredHeaders,
  isBlankRow,
  mapSheetRow,
  type SheetRow,
  type Side,
} from '../src/domain/import-mapper'

// `tsx` does not auto-load .env.local the way Next.js does.
loadEnv({ path: '.env.local' })

function loadRowsFromExcelFile(filePath: string): string[][] {
  const buffer = readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
  return rows.map((row) => row.map((cell) => String(cell ?? '')))
}

function rowsToObjects(headerRow: string[], dataRows: string[][]): SheetRow[] {
  return dataRows.map((rawRow) => {
    const obj: SheetRow = {}
    headerRow.forEach((header, i) => {
      obj[header.trim()] = rawRow[i] ?? ''
    })
    return obj
  })
}

function validateHeaders(headerRow: string[], fileLabel: string) {
  const present = headerRow.map((h) => h.trim())
  const missing = requiredHeaders().filter((h) => !present.includes(h))
  if (missing.length > 0) {
    throw new Error(
      `${fileLabel} is missing required column(s): ${missing.join(', ')}. ` +
        `This is structural damage, refusing to import. Found columns: ${present.join(', ')}`
    )
  }
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const dryRun = args.includes('--dry-run')
  const filePaths = args.filter((a) => !a.startsWith('--'))

  if (filePaths.length === 0) {
    throw new Error(
      'Usage: tsx scripts/import-sheet.ts [--dry-run] [--force] <file1.xlsx> [file2.xlsx ...]\n' +
        'One file per side is typical (e.g. fatan.xlsx sita.xlsx), but any number of files is accepted.'
    )
  }

  const admin = getAdminSupabase()

  // The sheet has no Side column: side comes from the inviter named in
  // Undangan, so the inviters table is what makes a row mappable at all.
  const { data: inviterRows, error: invitersError } = await admin.from('inviters').select('key, side')
  if (invitersError) throw new Error(`Failed to load inviters: ${invitersError.message}`)
  const inviterSides = Object.fromEntries(
    (inviterRows ?? []).map((r) => [r.key, r.side as Side])
  ) as Record<string, Side>
  if (Object.keys(inviterSides).length === 0) {
    throw new Error('inviters table is empty. Run the migrations before importing.')
  }

  const { count: existingCount, error: countError } = await admin
    .from('guests')
    .select('id', { count: 'exact', head: true })
  if (countError) throw new Error(`Failed to check existing guests: ${countError.message}`)
  if ((existingCount ?? 0) > 0 && !force && !dryRun) {
    throw new Error(
      `guests table already has ${existingCount} row(s). Import is one-shot at cut-over, ` +
        `pass --force to re-run against a non-empty table.`
    )
  }

  let totalRows = 0
  let imported = 0
  let withPhone = 0
  const skipped: string[] = []
  const flagged: string[] = []
  const phoneOwners = new Map<string, string>()

  for (const filePath of filePaths) {
    const fileLabel = basename(filePath)
    console.log(`Reading ${fileLabel}...`)
    const allRows = loadRowsFromExcelFile(filePath)
    if (allRows.length === 0) {
      throw new Error(`${fileLabel} has no rows at all, refusing to import.`)
    }
    const [headerRow, ...dataRows] = allRows
    validateHeaders(headerRow, fileLabel)

    // Note isn't a required header (a sheet without it is still importable),
    // but silently importing every note as empty is worth saying out loud.
    if (!headerRow.map((h) => h.trim()).includes('Note')) {
      console.log(`Warning: ${fileLabel} has no "Note" column, all notes will import as empty.`)
    }

    // An exported sheet carries hundreds of empty padding rows. Drop them here
    // so they never reach the mapper and never show up as anomalies, but keep
    // each row's real sheet line number for the report.
    const sheetRows = rowsToObjects(headerRow, dataRows)
      .map((row, index) => ({ row, rowNumber: index + 2 })) // header is row 1
      .filter(({ row }) => !isBlankRow(row))

    totalRows += sheetRows.length

    for (const { row: sheetRow, rowNumber } of sheetRows) {
      const label = `${fileLabel} row ${rowNumber} (${sheetRow['Nama'] || 'unnamed'})`
      const mapped = mapSheetRow(sheetRow, { inviterSides })
      if (!mapped.ok) {
        skipped.push(`${label}: ${mapped.errors.join('; ')}`)
        continue
      }

      const { guest, guestEvents } = mapped.row
      for (const warning of mapped.warnings) flagged.push(`${label}: ${warning}`)

      if (guest.phone) {
        const previousOwner = phoneOwners.get(guest.phone)
        if (previousOwner) {
          flagged.push(`${label}: phone ${guest.phone} is also ${previousOwner}'s`)
        } else {
          phoneOwners.set(guest.phone, guest.name)
        }
      }

      if (dryRun) {
        imported += 1
        if (guest.phone) withPhone += 1
        continue
      }

      const { data: insertedGuest, error: guestError } = await admin
        .from('guests')
        .insert({
          name: guest.name,
          pax: guest.pax,
          side: guest.side,
          inviter_key: guest.inviterKey,
          type: guest.type,
          note: guest.note,
          phone: guest.phone,
          is_vip: guest.isVip,
        })
        .select()
        .single()

      if (guestError || !insertedGuest) {
        skipped.push(`${label}: failed to insert guest, ${guestError?.message}`)
        continue
      }

      if (guestEvents.length > 0) {
        const { error: eventsError } = await admin.from('guest_events').insert(
          guestEvents.map((ge) => ({
            guest_id: insertedGuest.id,
            event: ge.event,
            invite_status: ge.inviteStatus,
          }))
        )
        if (eventsError) {
          flagged.push(`${label}: guest inserted but guest_events failed, ${eventsError.message}`)
          continue
        }
      }

      imported += 1
      if (guest.phone) withPhone += 1
    }
  }

  console.log(
    `\n${dryRun ? 'Would import' : 'Imported'} ${imported} of ${totalRows} rows across ` +
      `${filePaths.length} file(s). ${withPhone} have a phone number.` +
      (dryRun ? ' Dry run: nothing was written.' : '')
  )

  if (skipped.length > 0) {
    console.log(`\n${skipped.length} row(s) NOT imported:`)
    for (const line of skipped) console.log(`  - ${line}`)
  }
  if (flagged.length > 0) {
    console.log(`\n${flagged.length} row(s) imported with a flag, review in-app:`)
    for (const line of flagged) console.log(`  - ${line}`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
