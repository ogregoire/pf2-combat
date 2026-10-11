import { EncounterScreen } from "./components/EncounterScreen.js";
import { HoverLayer } from "./components/HoverCard.js";

export function App(): React.ReactElement {
  return (
    <>
      <EncounterScreen />
      <HoverLayer />
    </>
  );
}
