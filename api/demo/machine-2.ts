import { handleDemoActor } from "../../apps/demo-api/src/handler.js";
export default (request: Parameters<typeof handleDemoActor>[1], response: Parameters<typeof handleDemoActor>[2]) => handleDemoActor(2, request, response);
