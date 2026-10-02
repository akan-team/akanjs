import { JellyArea, JellyLauncher, JellySpin, JellySteps, jellyUiButtonRecipe } from "@apps/akan/ui";
import { override } from "akanjs/ui";

export default override({
  AgentLauncher: JellyLauncher,
  AgentSteps: JellySteps,
  LoadingArea: JellyArea,
  LoadingSpin: JellySpin,
  recipes: { button: jellyUiButtonRecipe },
});
