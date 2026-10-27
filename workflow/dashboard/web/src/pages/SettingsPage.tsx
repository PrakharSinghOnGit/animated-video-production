import { EnvEditor } from "./settings/EnvEditor";
import { ModelsForm } from "./settings/ModelsForm";
import { FileEditor } from "./settings/FileEditor";

export function SettingsPage() {
  return (
    <div className="grid gap-4 p-4 pb-10">
      <div><h1 className="m-0 text-lg font-semibold tracking-tight">Settings</h1><p className="m-0 mt-1 max-w-3xl text-xs text-muted-foreground">Configuration for the whole workflow: environment keys, model defaults, prompts, house styles and the channel voice. Secret values are masked until you reveal them.</p></div>
      <ModelsForm />
      <EnvEditor />
      <FileEditor />
    </div>
  );
}
