import { AssistantProvider } from "@/ui/assistant/assistant-provider";
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { themeInitialisationScript } from "@/lib/theme";
import { cookies } from "next/headers";
import { LoadingProgressProvider } from "@/ui/shell/loading-progress-provider";
import { AppThemeProvider } from "@/ui/shell/app-theme-provider";
import { SIDEBAR_STATE_COOKIE } from "@/ui/shell/sidebar-cookie";
import { SidebarPreferenceProvider } from "@/ui/shell/sidebar-preference";
import { getAuthContext } from "@/lib/auth/viewer";
import { loadCoursemapState } from "@/lib/coursemap/state";
import { getCanonicalSiteOrigin } from "@/lib/supabase/config";
import "./globals.css";
import { AppProvider } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const origin = getCanonicalSiteOrigin() ?? "http://localhost:3000";

  return {
    title: "Coursemap · Your ANU degree, mapped",
    description:
      "A clear, modern degree roadmap for courses, prerequisites, majors and approvals.",
    manifest: "/site.webmanifest",
    icons: {
      icon: [{ url: "/icon-32.png?v=3", sizes: "32x32", type: "image/png" }],
      shortcut: "/icon-32.png?v=3",
      apple: [
        {
          url: "/apple-touch-icon.png?v=3",
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
    openGraph: {
      title: "Coursemap · Your ANU degree, mapped",
      description:
        "See what counts, what unlocks next and where every course fits.",
      type: "website",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1536,
          height: 896,
          alt: "Coursemap degree roadmap preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Coursemap · Your ANU degree, mapped",
      description:
        "See what counts, what unlocks next and where every course fits.",
      images: [`${origin}/og.png`],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { viewer, canAccessAdmin } = await getAuthContext();
  const initialState = viewer ? await loadCoursemapState(viewer) : undefined;
  // The sidebar writes its open state to a cookie; reading it here keeps a
  // collapsed rail collapsed on the next server render.
  const sidebarDefaultOpen =
    (await cookies()).get(SIDEBAR_STATE_COOKIE)?.value !== "false";

  return (
    // The font variables sit on the root element because the theme resolves
    // --font-sans there; on body they would be undefined where it is read.
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the theme while parsing HTML, before the Next.js runtime loads. */}
        <script
          id="coursemap-theme-init"
          dangerouslySetInnerHTML={{
            __html: themeInitialisationScript(Boolean(viewer)),
          }}
        />
      </head>
      {/* style-nova activates the vendored ReUI component styles product-wide. */}
      <body className="style-nova">
        <AppThemeProvider authenticated={Boolean(viewer)}>
          <AppProvider
            viewer={viewer}
            canAccessAdmin={canAccessAdmin}
            initialState={initialState}
          >
            <SidebarPreferenceProvider defaultOpen={sidebarDefaultOpen}>
              <AssistantProvider
                key={viewer?.id ?? "guest"}
                owner={viewer?.id ?? null}
              >
                <LoadingProgressProvider>{children}</LoadingProgressProvider>
              </AssistantProvider>
            </SidebarPreferenceProvider>
          </AppProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
