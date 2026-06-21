import dynamic from "next/dynamic";

const OverviewMapInner = dynamic(() => import("./OverviewMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-xl bg-surface-muted ring-1 ring-border-default max-sm:h-[300px]">
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading map...
      </div>
    </div>
  )
});

export default function OverviewMap(props) {
  return <OverviewMapInner {...props} />;
}
