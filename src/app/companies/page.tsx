import { DrivesTable } from "@/components/client";
import { CategoryTabs, PageHeader } from "@/components/ui";
import { listDrives, parseCategory } from "@/lib/queries";

export default async function Companies({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const cat = parseCategory((await searchParams).cat);
  return (
    <>
      <PageHeader title="Companies" sub="One row per drive. Click a column heading to sort.">
        <CategoryTabs current={cat} basePath="/companies" />
      </PageHeader>
      <DrivesTable drives={await listDrives(cat)} />
    </>
  );
}
