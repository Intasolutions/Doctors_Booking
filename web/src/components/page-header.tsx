import Link from "next/link";

/** The title block every workspace page starts with. */
export function PageHeader({
  title,
  eyebrow,
  description,
  back,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
      <div className="grid min-w-0 gap-1">
        {back && (
          <Link href={back.href} className="mb-1 text-sm font-semibold text-brand hover:text-brand-dark">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <p className="label">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold sm:text-[28px]">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
