"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

type ClassValue = string | false | null | undefined;
function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}

export type PromptTool = "image" | "web" | "code" | "research" | "think";
export type PromptImage = { name: string; mimeType: string; dataUrl: string };
export type PromptSubmit = { message: string; tool: PromptTool | null; image: PromptImage | null };

type PromptBoxProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "onSubmit"> & {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (payload: PromptSubmit) => void | boolean | Promise<void | boolean>;
  busy?: boolean;
};

export const PromptBox = React.forwardRef<HTMLTextAreaElement, PromptBoxProps>(function PromptBox(
  { value, onValueChange, onSubmit, busy = false, className, placeholder = "Message MOP-AGENT…", ...props },
  forwardedRef,
) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const [image, setImage] = React.useState<PromptImage | null>(null);
  const [selectedTool, setSelectedTool] = React.useState<PromptTool | null>(null);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState("");

  React.useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  React.useEffect(() => () => recognitionRef.current?.stop(), []);

  async function submit() {
    const message = value.trim();
    if (busy || (!message && !image)) return;
    const accepted = await onSubmit({ message, tool: selectedTool, image });
    if (accepted === false) return;
    setImage(null);
    setSelectedTool(null);
    setVoiceError("");
  }

  function attachFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setVoiceError("Only image attachments are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setVoiceError("Image must be 5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage({ name: file.name, mimeType: file.type, dataUrl: String(reader.result) });
      setVoiceError("");
    };
    reader.readAsDataURL(file);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceError("Voice input is not supported by this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    const startingValue = value;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      onValueChange(`${startingValue}${startingValue && transcript ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceError("Voice input could not be started.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setVoiceError("");
    setListening(true);
    recognition.start();
  }

  const activeTool = toolItems.find((item) => item.id === selectedTool);
  const ActiveToolIcon = activeTool?.icon;
  const canSend = !busy && (!!value.trim() || !!image);

  return (
    <div className={cn("mop-prompt-box flex flex-col rounded-[26px] border border-[#2d4a3e]/40 bg-[#fffdf2] p-2 shadow-sm", className)}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={attachFile} />

      {image && (
        <DialogPrimitive.Root open={previewOpen} onOpenChange={setPreviewOpen}>
          <div className="relative mb-1 ml-1 w-fit">
            <DialogPrimitive.Trigger asChild>
              <button type="button" className="mop-prompt-preview-trigger" title="Preview attachment">
                <img src={image.dataUrl} alt={image.name} className="h-16 w-16 rounded-xl object-cover" />
              </button>
            </DialogPrimitive.Trigger>
            <button type="button" className="mop-prompt-remove-image" aria-label="Remove image" onClick={() => setImage(null)}>
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm" />
            <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[101] w-[min(900px,92vw)] -translate-x-1/2 -translate-y-1/2 outline-none">
              <div className="relative rounded-2xl bg-[#fffdf2] p-3 shadow-2xl">
                <img src={image.dataUrl} alt={image.name} className="max-h-[82vh] w-full rounded-xl object-contain" />
                <DialogPrimitive.Close className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-full bg-[#2d4a3e] text-[#fef9e1]" aria-label="Close preview">
                  <XIcon className="h-4 w-4" />
                </DialogPrimitive.Close>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}

      <textarea
        {...props}
        ref={textareaRef}
        rows={1}
        value={value}
        disabled={busy}
        placeholder={placeholder}
        className="mop-prompt-textarea min-h-12 w-full resize-none border-0 bg-transparent p-3 text-[#2d4a3e] outline-none placeholder:text-[#2d4a3e]/45"
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />

      <div className="flex items-center gap-2 px-1 pb-1">
        <Tooltip label="Attach image">
          <button type="button" className="mop-prompt-round-button" onClick={() => fileInputRef.current?.click()} disabled={busy} aria-label="Attach image">
            <PlusIcon className="h-5 w-5" />
          </button>
        </Tooltip>

        <PopoverPrimitive.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
          <TooltipPrimitive.Provider delayDuration={100}>
            <TooltipPrimitive.Root>
              <TooltipPrimitive.Trigger asChild>
                <PopoverPrimitive.Trigger asChild>
                  <button type="button" className="mop-prompt-tool-button" disabled={busy}>
                    <SettingsIcon className="h-4 w-4" />
                    {!selectedTool && <span>Tools</span>}
                  </button>
                </PopoverPrimitive.Trigger>
              </TooltipPrimitive.Trigger>
              <TooltipPortal label="Explore tools" />
            </TooltipPrimitive.Root>
          </TooltipPrimitive.Provider>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content side="top" align="start" sideOffset={9} className="mop-prompt-popover z-[90] w-64 rounded-xl border border-[#2d4a3e]/30 bg-[#fffdf2] p-2 text-[#2d4a3e] shadow-xl outline-none">
              {toolItems.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="mop-prompt-popover-item"
                  onClick={() => { setSelectedTool(tool.id); setPopoverOpen(false); }}
                >
                  <tool.icon className="h-4 w-4" />
                  <span>{tool.name}</span>
                </button>
              ))}
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>

        {activeTool && (
          <button type="button" className="mop-prompt-active-tool" onClick={() => setSelectedTool(null)} disabled={busy}>
            {ActiveToolIcon && <ActiveToolIcon className="h-4 w-4" />}
            <span>{activeTool.shortName}</span>
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Tooltip label={listening ? "Stop listening" : "Voice input"}>
            <button type="button" className={cn("mop-prompt-round-button", listening && "is-listening")} onClick={toggleVoice} disabled={busy} aria-label={listening ? "Stop listening" : "Voice input"}>
              <MicIcon className="h-4.5 w-4.5" />
            </button>
          </Tooltip>
          <Tooltip label="Send">
            <button type="button" className="mop-prompt-send" disabled={!canSend} onClick={() => void submit()} aria-label="Send message">
              <SendIcon className="h-5 w-5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {voiceError && <p className="mop-prompt-error">{voiceError}</p>}
    </div>
  );
});

function Tooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPortal label={label} />
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

function TooltipPortal({ label }: { label: string }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content side="top" sideOffset={6} className="z-[110] rounded-md bg-[#2d4a3e] px-2 py-1 text-xs text-[#fef9e1] shadow-lg">
        {label}<TooltipPrimitive.Arrow className="fill-[#2d4a3e]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<{ 0?: { transcript?: string } }> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  const voiceWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
}

type IconProps = React.SVGProps<SVGSVGElement>;
const PlusIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" {...props}><path d="M12 5v14M5 12h14" /></svg>;
const SettingsIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><path d="M20 7h-9M14 17H5" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></svg>;
const SendIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}><path d="M12 19V5m-7 7 7-7 7 7" /></svg>;
const XIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>;
const GlobeIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z" /></svg>;
const PencilIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="m4 20 4-1 11-11a2.8 2.8 0 0 0-4-4L4 15l-1 5Z" /><path d="m14 5 5 5" /></svg>;
const BrushIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="m14 4 6 6-9 9c-2 2-6 1-7 1 0-1-1-5 1-7l9-9Z" /><path d="m11 7 6 6M4 20c-1 1-2 1-3 1 1-1 1-2 1-3" /></svg>;
const TelescopeIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="m3 7 13 5 2-5L5 2 3 7Z" /><path d="m11 11-3 10m6-9 3 9M7 21h12" /></svg>;
const BulbIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M9 18h6m-5 3h4m3-7c1-1 2-3 2-5a7 7 0 1 0-14 0c0 2 1 4 2 5 1 1 2 2 2 4h6c0-2 1-3 2-4Z" /></svg>;
const MicIcon = (props: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" /></svg>;

const toolItems: Array<{ id: PromptTool; name: string; shortName: string; icon: React.ComponentType<IconProps> }> = [
  { id: "image", name: "Create an image", shortName: "Image", icon: BrushIcon },
  { id: "web", name: "Search the web", shortName: "Search", icon: GlobeIcon },
  { id: "code", name: "Write or code", shortName: "Write", icon: PencilIcon },
  { id: "research", name: "Run deep research", shortName: "Research", icon: TelescopeIcon },
  { id: "think", name: "Think for longer", shortName: "Think", icon: BulbIcon },
];
