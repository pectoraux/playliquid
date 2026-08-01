'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wallet as WalletIcon, ArrowDownRight, Plus, Loader2 as Spinner } from 'lucide-react';
import { useSession } from '@/lib/auth/use-session';
import { useToast } from '@/hooks/use-toast';

export default function WalletPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState('GHS');
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch(`/api/dashboard?role=player&userId=${session.userId}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setBalance(d.data.wallet?.balance ?? 0);
          setCurrency(d.data.wallet?.currency ?? 'GHS');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session]);

  async function handleDeposit() {
    if (!session) return;
    const amount = parseInt(depositAmount, 10);
    if (!amount || amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a positive number', variant: 'destructive' });
      return;
    }

    setDepositing(true);
    try {
      const res = await fetch('/api/game/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.userId, amount, currency: 'GHS' }),
      });
      const data = await res.json();
      if (data.ok) {
        setBalance(data.data.balance);
        setDepositAmount('');
        toast({ title: 'Deposit successful', description: `${amount} GHS added to your wallet. New balance: ${data.data.balance} GHS.` });
      } else {
        toast({ title: 'Deposit failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network error', description: 'Could not reach server', variant: 'destructive' });
    } finally {
      setDepositing(false);
    }
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;

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
            <div className="text-sm text-zinc-500">This Month</div>
          </CardContent>
        </Card>
      </div>

      {/* Deposit */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <ArrowDownRight className="h-5 w-5 text-emerald-400" />
            <h2 className="font-medium text-zinc-100">Deposit Funds</h2>
          </div>
          <p className="text-sm text-zinc-500 mb-4">Add funds to your wallet to purchase playtime and participate in tournaments.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="amount">Amount ({currency})</Label>
              <Input
                id="amount"
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="100"
                className="mt-1 border-white/10 bg-white/[0.03] text-zinc-100"
              />
            </div>
            <div className="flex gap-2">
              {[100, 500, 1000].map(amt => (
                <Button key={amt} variant="outline" size="sm" onClick={() => setDepositAmount(String(amt))} className="border-white/10 text-zinc-300">
                  {amt}
                </Button>
              ))}
            </div>
            <Button onClick={handleDeposit} disabled={depositing} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              {depositing ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Deposit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">Recent Activity</h2>
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-0">
            <div className="p-6 text-center text-sm text-zinc-600">
              No transactions yet. Deposit funds to start playing.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
