// Firefox and desktop Safari ship no Badging API, and reading a missing method off `navigator` and calling it
// throws synchronously — which would take the whole badge action down with it.
export const setAppBadge = (count: number) => {
  if (!("setAppBadge" in navigator)) return;
  void navigator.setAppBadge(count);
};
