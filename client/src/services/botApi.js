
/**
 * AEMA Private Bot API
 *
 * Compatibility re-export.
 *
 * All private bot requests use the dedicated bot API client.
 * Authentication is handled by the private bot password
 * and server-issued bot session.
 *
 * Supabase authentication remains in the main AEMA platform,
 * not in this private bot API client.
 */

export * from "../bot/services/botApi.js";
