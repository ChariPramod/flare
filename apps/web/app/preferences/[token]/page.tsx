import { PreferencePage } from '../../../components/preference-page';
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <PreferencePage token={(await params).token} />;
}
