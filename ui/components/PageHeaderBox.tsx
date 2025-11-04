interface PageHeaderBoxProps {
  title: string;
}

export function PageHeaderBox({ title }: PageHeaderBoxProps) {
  return (
    <div className="bg-theme-card border border-theme-border rounded-[9px] p-3 hover:border-theme-border-hover transition-all duration-300">
      <h1 className="text-2xl font-semibold text-theme-text">
        {title}
      </h1>
    </div>
  );
}
