export const Loading = () => {
  return (
    <div className="flex h-[760px] w-full animate-pulse items-center justify-center rounded-lg bg-muted">
      <span className="inline-block size-8 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
    </div>
  );
};
