import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditEntry = {
  actorId: string
  actorName: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  entityLabel: string
  diff: Record<string, { old: unknown; new: unknown }>
}

// A failed audit write never blocks or reverts the mutation it records: the
// real write has already committed by the time this runs. Log and move on
// rather than surfacing an unrelated audit-log error as a failed guest save.
export async function insertAuditLog(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actorId,
    actor_name: entry.actorName,
    actor_role: entry.actorRole,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    entity_label: entry.entityLabel,
    diff: entry.diff,
  })
  if (error) {
    console.error(
      `Failed to write audit log for ${entry.action} on ${entry.entityType} ${entry.entityId}: ${error.message}`
    )
  }
}

export type AuditLogRow = {
  id: string
  actorId: string | null
  actorName: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  entityLabel: string
  diff: Record<string, { old: unknown; new: unknown }>
  createdAt: string
}

export async function listAuditLog(
  supabase: SupabaseClient,
  filters: { entityType?: string; actorName?: string } = {}
): Promise<AuditLogRow[]> {
  let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.actorName) query = query.eq('actor_name', filters.actorName)

  const { data, error } = await query
  if (error) throw new Error(`Failed to list audit log: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    diff: row.diff,
    createdAt: row.created_at,
  }))
}
