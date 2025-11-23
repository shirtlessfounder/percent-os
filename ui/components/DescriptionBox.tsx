interface DescriptionBoxProps {
  content: React.ReactNode;
}

export function DescriptionBox({ content }: DescriptionBoxProps) {
  return (
    <div className="bg-theme-card border border-theme-border rounded-[9px] p-3 hover:border-theme-border-hover transition-all duration-300">
      <div className="text-theme-text flex flex-col gap-2">
        <span className="text-xs text-theme-text-secondary">Description</span>
        <div className="text-sm text-theme-text-secondary">
          {content}
        </div>
      </div>
    </div>
  );
}
