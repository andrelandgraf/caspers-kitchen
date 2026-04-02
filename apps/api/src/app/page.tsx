import DataCreator from "./data-creator";
import { getSimPassword } from "@/lib/simulation/config";

export default function Home() {
  return <DataCreator simPassword={getSimPassword()} />;
}
