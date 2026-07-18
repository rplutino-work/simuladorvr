import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// A fixed bcrypt hash to compare against when the user doesn't exist, so the
// response time is the same as for a real user (no timing-based enumeration).
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Dv.N5uJ8Dv.N5uJ8Dv.N5uJ8Dv.N5";

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = (credentials.email as string).toLowerCase().trim();

        // Throttle attempts per account (credential stuffing / brute force).
        const rl = await rateLimit(`login:${email}`, 8, 15 * 60 * 1000);
        if (!rl.ok) return null;

        const user = await prisma.user.findUnique({ where: { email } });

        // Always run a bcrypt compare (dummy hash if the user doesn't exist) so
        // the timing can't be used to enumerate valid emails.
        const valid = await bcrypt.compare(
          credentials.password as string,
          user?.password ?? DUMMY_HASH
        );
        if (!user || !valid) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/admin/login",
  },
};

export async function auth() {
  return getServerSession(authOptions);
}
