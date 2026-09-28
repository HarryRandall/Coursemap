import { useId } from "react";
import { Link as LinkIcon } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Hint } from "@/ui/common/hint";
import type { Society } from "@/lib/societies";

function SocialIcon({
  label,
  coloured = false,
}: {
  label: string;
  coloured?: boolean;
}) {
  const gradientId = useId();
  const instagramColour = coloured ? `url(#${gradientId})` : "currentColor";
  if (label === "Instagram")
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke={instagramColour}
        strokeWidth="1.8"
      >
        {coloured ? (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset="0.3" stopColor="#FA7E1E" />
              <stop offset="0.55" stopColor="#D62976" />
              <stop offset="0.8" stopColor="#962FBF" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
        ) : null}
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill={instagramColour} stroke="none" />
      </svg>
    );
  if (label === "Facebook")
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill={coloured ? "#1877F2" : "currentColor"}
      >
        <path d="M14 22v-9h3l.5-4H14V7c0-1.2.4-2 2-2h2V1.5c-.6-.1-1.8-.3-3-.3-3 0-5 1.8-5 5.2V9H7v4h3v9Z" />
      </svg>
    );
  // Discord mark from Simple Icons (CC0): https://simpleicons.org/?q=discord
  if (label === "Discord")
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill={coloured ? "#5865F2" : "currentColor"}
      >
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      </svg>
    );
  return <LinkIcon aria-hidden="true" />;
}

export function SocietySocialLinks({ links }: { links: Society["links"] }) {
  if (!links?.length) return null;
  return (
    <nav aria-label="Club social links" className="flex items-center gap-1">
      {links.map((link) => (
        <Hint key={link.url} label={link.label}>
          <Button asChild variant="ghost" size="icon-sm">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              aria-label={link.label}
              className="group/social text-muted-foreground"
            >
              <span aria-hidden="true" className="relative size-4">
                <span className="absolute inset-0 transition-opacity duration-200 group-hover/social:opacity-0 group-focus-visible/social:opacity-0 motion-reduce:transition-none">
                  <SocialIcon label={link.label} />
                </span>
                <span className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/social:opacity-100 group-focus-visible/social:opacity-100 motion-reduce:transition-none">
                  <SocialIcon label={link.label} coloured />
                </span>
              </span>
            </a>
          </Button>
        </Hint>
      ))}
    </nav>
  );
}
