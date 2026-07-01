import dynamic from "next/dynamic";
import { MapSkeleton } from "./Skeleton";

const VehicleMapInner = dynamic(() => import("./VehicleMapInner"), {
  ssr: false,
  loading: () => <MapSkeleton />
});

export default function VehicleMap(props) {
  return <VehicleMapInner {...props} />;
}
