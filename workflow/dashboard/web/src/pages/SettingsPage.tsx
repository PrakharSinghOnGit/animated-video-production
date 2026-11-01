import { EnvEditor } from "./settings/EnvEditor";
import { ModelsForm } from "./settings/ModelsForm";
import { AgentModels } from "./settings/AgentModels";
import { FileEditor } from "./settings/FileEditor";
import { NotificationsForm } from "./settings/NotificationsForm";
import { RemoteAccess } from "./settings/RemoteAccess";

export function SettingsPage() {
  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      <div><h1 className="m-0 text-[20px] font-semibold leading-tight tracking-[-0.02em]">Settings</h1><p className="m-0 mt-1.5 max-w-3xl text-[13px] text-muted-foreground">Configuration for the whole workflow: environment keys, model defaults, prompts, house styles and the channel voice. Secret values are masked until you reveal them.</p></div>
      <RemoteAccess />
      <NotificationsForm />
      <AgentModels />
      <ModelsForm />
      <EnvEditor />
      <FileEditor />
    </div>
  );
}
