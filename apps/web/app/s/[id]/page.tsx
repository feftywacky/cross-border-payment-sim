import { SharedScenario } from "@/components/SharedScenario";

export default async function Page(props: PageProps<"/s/[id]">) {
  const { id } = await props.params;
  return <SharedScenario id={id} />;
}
