import { sleep } from "akanjs/common";
import { Link } from "akanjs/ui";

export const Loading = ({ params }: { params: { param: string } }) => {
  return <div>Loading loadingTest {params.param}</div>;
};

export default async function Page({ params }: { params: { param: string } }) {
  await sleep(2000);
  return (
    <div>
      Hello {params.param}
      <Link href={`/loadingtest`}>Home</Link>
      <Link href={`/loadingtest/${params.param + 1}`}>{params.param + 1}</Link>
    </div>
  );
}
