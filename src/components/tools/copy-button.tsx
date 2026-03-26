"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyButtonProps = {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied!",
  className,
  disabled = false
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsCopied(false);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [isCopied]);

  async function handleCopy() {
    if (disabled || !text.trim()) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setIsCopied(true);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={disabled || !text.trim()} className={className}>
      <Copy className="h-4 w-4" />
      {isCopied ? copiedLabel : label}
    </Button>
  );
}
