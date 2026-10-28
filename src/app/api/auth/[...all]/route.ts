import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/server";

// Better Auth endpoints (sign-up/in, sessions, organizations, multi-session).
async function handle(request: Request) {
  const auth = await getAuth();
  const { GET, POST } = toNextJsHandler(auth);
  return request.method === "GET" ? GET(request) : POST(request);
}

export { handle as GET, handle as POST };
