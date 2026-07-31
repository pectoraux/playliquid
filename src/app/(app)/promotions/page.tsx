'use client';

import { RolePage } from '@/components/role-page';
import { Tags } from 'lucide-react';
export default function PromotionsPage() {
  return <RolePage config={{ title: 'Promotions', description: 'Active and scheduled promotions', icon: Tags, role: 'marketplace', sections: [{ title: 'Active Promotions', type: 'list', data: [{ id: 'p1', title: 'Spring Sale', subtitle: '25% off all games · ends in 3 days', badge: { text: 'Active', variant: 'default' } }, { id: 'p2', title: 'New Creator Feature', subtitle: 'Featured placement', badge: { text: 'Active', variant: 'default' } }] }] }} />;
}
