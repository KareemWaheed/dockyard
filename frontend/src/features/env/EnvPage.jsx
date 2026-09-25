import { useParams } from 'react-router';
import { PageHeader } from '@/app/PageHeader';

export default function EnvPage() {
  const { env } = useParams();
  return <PageHeader title={env} />;
}
