import React from 'react';

interface PageContainerProps {
  title?: string;
  subtitle?: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; path?: string }[];
  children: React.ReactNode;
}

export const PageContainer: React.FC<PageContainerProps> = ({
  title,
  subtitle,
  description,
  actions,
  children,
}) => {
  const displaySubtitle = subtitle || description;
  return (
    <div className="space-y-6 pb-12">
      {/* Header section */}
      {(title || displaySubtitle || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {title && (
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {title}
              </h1>
            )}
            {displaySubtitle && (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {displaySubtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2.5 shrink-0 flex-wrap">{actions}</div>}
        </div>
      )}

      {/* Main Content */}
      <div>{children}</div>
    </div>
  );
};
