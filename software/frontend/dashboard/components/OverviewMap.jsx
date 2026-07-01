import dynamic from "next/dynamic";
import { MapSkeleton } from "./Skeleton";

const OverviewMapInner = dynamic(() => import("./OverviewMapInner"), {
  ssr: false,
  loading: () => <MapSkeleton />
});

export default function OverviewMap(props) {
  return <OverviewMapInner {...props} />;
}
