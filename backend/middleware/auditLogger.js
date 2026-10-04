const { createClient } = require("@supabase/supabase-js");

/**
 * Log audit events to public.audit_logs table
 */
async function logAuditEvent({ hospitalId, actorUserId, actorRole, action, resourceType, resourceId, metadata = {} }) {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.warn("[AuditLogger Notice] Supabase credentials missing, skipping audit log write.");
            return;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const auditRecord = {
            hospital_id: hospitalId,
            actor_user_id: actorUserId,
            actor_role: actorRole,
            action,
            resource_type: resourceType,
            resource_id: String(resourceId),
            metadata,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from("audit_logs").insert(auditRecord);
        if (error) {
            console.warn("[AuditLogger Warning] Failed to insert audit log:", error.message);
        } else {
            console.log(`[AuditLogger] Logged '${action}' on ${resourceType}:${resourceId} by ${actorRole}:${actorUserId}`);
        }
    } catch (err) {
        console.warn("[AuditLogger Exception]:", err.message);
    }
}

module.exports = {
    logAuditEvent
};
