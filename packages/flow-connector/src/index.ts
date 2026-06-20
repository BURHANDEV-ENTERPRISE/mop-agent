/**
 * @mop/flow-connector — MOP-FLOW vNext connector.
 *
 * Public surface for embedding the connector (e.g. inside the published mop-flow,
 * or for tests that drive the link end-to-end).
 */
export { pair, type PairOptions } from "./pair.js";
export { serve, type ServeOptions } from "./serve.js";
export { buildSnapshot, redactSensitive } from "./snapshot.js";
export { handleToolRequest, CapabilityError, type ToolContext } from "./tools.js";
export {
  readLink,
  writeLink,
  isLinked,
  linkPath,
  type LinkFile,
} from "./linkfile.js";
