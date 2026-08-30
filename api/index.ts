/**
 * Vercel serverless entry for the EraseGraph control plane.
 * Serves /api/*, /health, and /mcp on the same deployment as the SPA.
 */
export { default } from "../services/erasegraph-mcp/src/hosted-app.js";
