import { sleep } from "akanjs/common";

export const Loading = () => {
  return <div>Loading loadingTest</div>;
};

export default async function Page() {
  await sleep(2000);
  return <div>Hello</div>;
}
