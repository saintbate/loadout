import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  // Run on every path except the Next internals. This way the root layout
  // (which uses Clerk's <SignedIn>/<SignedOut> + our isAdmin()) can call
  // auth() even when Next renders the not-found page for a missing static
  // asset like /apple-touch-icon.png.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/(api|trpc)(.*)"],
};
