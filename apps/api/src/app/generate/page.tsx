import DataCreator from "../data-creator";
import { getSimPassword } from "@/lib/simulation/config";

export default function GeneratePage() {
  return <DataCreator simPassword={getSimPassword()} />;
}
