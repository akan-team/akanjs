import { cn } from "akanjs/client";
import { Link } from "akanjs/ui";
import { FaLink } from "react-icons/fa";

interface ExternalLinkProps {
  className?: string;
  href: string;
  label: string;
}
export const ExternalLink = ({ className, href, label }: ExternalLinkProps) => (
  <Link
    href={href}
    target="_blank"
    rel="noreferrer"
    className={cn(
      "jelly tint-planet squish ml-1 inline-flex size-5 -translate-y-px items-center justify-center rounded-full align-baseline text-white",
      className,
    )}
    aria-label={label}
    title={label}
  >
    <FaLink className="size-2.5" />
  </Link>
);
