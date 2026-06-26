import { Toaster as SonnerToaster, toast } from "sonner";

function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "bg-zinc-950 border border-zinc-800 text-zinc-100 shadow-lg rounded-lg",
          title: "text-zinc-50 font-semibold",
          description: "text-zinc-400 text-sm",
          actionButton: "bg-zinc-50 text-zinc-900",
          cancelButton: "bg-zinc-800 text-zinc-100",
          error: "border-red-500/50 bg-red-950/50 text-red-400",
          success: "border-green-500/50 bg-green-950/50 text-green-400",
          warning: "border-yellow-500/50 bg-yellow-950/50 text-yellow-400",
          info: "border-blue-500/50 bg-blue-950/50 text-blue-400",
        },
      }}
      theme="dark"
      richColors
    />
  );
}

export { Toaster, toast };
