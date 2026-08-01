'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Wallet as WalletIcon, ArrowDownRight, ArrowUpRight, Plus } from 'lucide-react';
import { useSession } from '@/lib/auth/use-session';
import { useToast } from '@/hooks/use-toast';

interface WalletData {
  wallet: { balance: number; currency: string };
}

export default function WalletPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    fetch(`/api/dashboard?role=player&userId=${session.userId}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session]);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;

  const balance = data?.wallet?.balance ?? 0;
  const currency = data?.wallet?.currency ?? 'GHS';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/15">
          <WalletIcon className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Wallet</h1>
          <p className="text-sm text-zinc-500">Your balance and transactions</p>
        </div>
      </div>

      {/* Balance */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-400">{balance.toLocaleString()} {currency}</div>
            <div className="text-sm text-zinc-400">Available Balance</div>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-zinc-100">0 {currency}</div>
            <div className="text-sm text-zinc-400">Pending</div>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-zinc-100">0 {currency}</div>
            <div className="text-sm text-zinc-400">Total Rewards</div>
          </CardContent>
        </Card>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-zinc-100">0 {currency}</div>
            <div className="text-sm text-zinc-400">This Month</div>
          </CardContent>
        </Card>
      </div>

      {/* Deposit */}
      <div className="flex gap-3">
        <Button className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" onClick={() => {
          toast({ title: 'Deposit', description: 'Deposit flow will be available when the payment system is configured.' });
        }}>
          <Plus className="mr-2 h-4 w-4" /> Deposit Funds
        </Button>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">Recent Activity</h2>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Date</TableHead>
                  <TableHead className="text-zinc-400">Description</TableHead>
                  <TableHead className="text-zinc-400">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-white/5">
                  <TableCell colSpan={3} className="py-8 text-center text-zinc-600">
                    No transactions yet. Deposit funds to start playing.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
