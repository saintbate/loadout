import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import { isAdmin } from "@/lib/auth-helpers";

export async function SiteHeader() {
  const admin = await isAdmin();
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-6 px-6 text-sm">
        <Link href="/" className="font-semibold tracking-tight">
          Loadout
        </Link>
        <nav className="flex items-center gap-4 text-neutral-600">
          <Link href="/browse" className="hover:text-neutral-900">
            Browse
          </Link>
          <SignedIn>
            <Link href="/my-recipes" className="hover:text-neutral-900">
              My recipes
            </Link>
          </SignedIn>
          <Link href="/submit" className="hover:text-neutral-900">
            Submit
          </Link>
          <Link href="/settings" className="hover:text-neutral-900">
            Settings
          </Link>
          {admin && (
            <Link href="/admin" className="hover:text-neutral-900">
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-neutral-700 hover:text-neutral-900">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{ elements: { avatarBox: "h-7 w-7" } }}
            />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
