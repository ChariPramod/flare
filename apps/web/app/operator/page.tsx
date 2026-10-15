import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { OperatorPage } from '../../components/operator-page';

export default async function Page() {
  if (!(await cookies()).get('flare_session')) redirect('/login');
  return <OperatorPage />;
}
