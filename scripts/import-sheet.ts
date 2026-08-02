// scripts/import-sheet.ts
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import * as XLSX from 'xlsx'
import { getAdminSupabase } from '../src/server/supabase/admin-client'
import { requiredHeaders, mapSheetRow, type SheetRow } from '../src/domain/import-mapper'

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
      obj[header] = rawRow[i] ?? ''
    })
    return obj
  })
}

function validateHeaders(headerRow: string[], fileLabel: string) {
  const missing = requiredHeaders().filter((h) => !headerRow.includes(h))
  if (missing.length > 0) {
    throw new Error(
      `${fileLabel} is missing required column(s): ${missing.join(', ')}. ` +
        `This is structural damage — refusing to import. Found columns: ${headerRow.join(', ')}`
    )
  }
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const filePaths = args.filter((a) => a !== '--force')

  if (filePaths.length === 0) {
    throw new Error(
      'Usage: tsx scripts/import-sheet.ts [--force] <file1.xlsx> [file2.xlsx ...]\n' +
        'One file per side is typical (e.g. fatan-side.xlsx sita-side.xlsx), but any number of files is accepted.'
    )
  }

  const admin = getAdminSupabase()

  const { count: existingCount, error: countError } = await admin
    .from('guests')
    .select('id', { count: 'exact', head: true })
  if (countError) throw new Error(`Failed to check existing guests: ${countError.message}`)
  if ((existingCount ?? 0) > 0 && !force) {
    throw new Error(
      `guests table already has ${existingCount} row(s). Import is one-shot at cut-over — ` +
        `pass --force to re-run against a non-empty table.`
    )
  }

  let totalRows = 0
  let imported = 0
  const anomalies: string[] = []

  for (const filePath of filePaths) {
    const fileLabel = basename(filePath)
    console.log(`Reading ${fileLabel}...`)
    const allRows = loadRowsFromExcelFile(filePath)
    if (allRows.length === 0) {
      throw new Error(`${fileLabel} has no rows at all — refusing to import.`)
    }
    const [headerRow, ...dataRows] = allRows
    validateHeaders(headerRow, fileLabel)

    const sheetRows = rowsToObjects(headerRow, dataRows)
    totalRows += sheetRows.length

    for (const [index, sheetRow] of sheetRows.entries()) {
      const rowNumber = index + 2 // header is row 1, data starts at row 2
      const mapped = mapSheetRow(sheetRow)
      if (!mapped.ok) {
        anomalies.push(`${fileLabel} row ${rowNumber} (${sheetRow['Name'] || 'unnamed'}): ${mapped.errors.join('; ')}`)
        continue
      }

      const { guest, guestEvents } = mapped.row
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
        anomalies.push(`${fileLabel} row ${rowNumber} (${guest.name}): failed to insert guest — ${guestError?.message}`)
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
          anomalies.push(`${fileLabel} row ${rowNumber} (${guest.name}): guest inserted but guest_events failed — ${eventsError.message}`)
          continue
        }
      }

      imported += 1
    }
  }

  console.log(`Imported ${imported} of ${totalRows} rows across ${filePaths.length} file(s).`)
  if (anomalies.length > 0) {
    console.log(`\n${anomalies.length} anomaly/anomalies (skipped, not imported):`)
    for (const line of anomalies) console.log(`  - ${line}`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
