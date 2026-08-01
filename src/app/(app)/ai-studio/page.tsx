'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/lib/auth/use-session';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, FileUp, Link2, Gamepad2, CheckCircle, Upload, Globe, Rocket } from 'lucide-react';

type DeployType = 'template' | 'upload' | 'external';

const TEMPLATES = [
  { id: 'liquid-tournament', name: 'Liquid Tournament', desc: 'Reaction-based target tapping game', icon: '🏆' },
  { id: 'bubble-pop', name: 'Bubble Pop Mania', desc: 'Casual bubble popping game', icon: '🫧' },
  { id: 'neon-runner', name: 'Neon Runner', desc: 'Endless runner with obstacles', icon: '🏃' },
  { id: 'cosmic-puzzle', name: 'Cosmic Puzzle', desc: 'Memory match card game', icon: '🧩' },
];

export default function AiStudioPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [deployType, setDeployType] = useState<DeployType | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState('');

  async function handleDeploy() {
    if (!session) return;
    if (!title.trim()) {
      toast({ title: 'Title required', description: 'Please enter a game title', variant: 'destructive' });
      return;
    }
    if (!deployType) return;

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        userId: session.userId,
        title: title.trim(),
        deployType,
      };

      if (deployType === 'template') {
        payload.template = selectedTemplate;
      } else if (deployType === 'external') {
        payload.externalUrl = externalUrl;
      } else if (deployType === 'upload') {
        payload.fileName = fileName;
        payload.fileData = fileData;
      }

      const res = await fetch('/api/game/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.ok) {
        toast({ title: 'Game deployed!', description: `"${title}" is now published and playable.` });
        setDeployType(null);
        setTitle('');
        setSelectedTemplate('');
        setExternalUrl('');
        setFileName('');
        setFileData('');
      } else {
        toast({ title: 'Deploy failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network error', description: 'Could not reach server', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 1MB', variant: 'destructive' });
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/15">
          <Sparkles className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">AI Studio</h1>
          <p className="text-sm text-zinc-500">Deploy games to the PlayLiquid platform</p>
        </div>
      </div>

      {/* Step 1: Choose deployment method */}
      {!deployType && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">Choose a deployment method</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="group cursor-pointer border-white/5 bg-white/[0.02] transition hover:border-emerald-500/30" onClick={() => setDeployType('template')}>
              <CardContent className="flex flex-col items-center p-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                  <Gamepad2 className="h-7 w-7" />
                </div>
                <h3 className="mt-3 font-bold text-zinc-100">From Template</h3>
                <p className="mt-1 text-xs text-zinc-500">Deploy using existing game templates on the platform</p>
              </CardContent>
            </Card>
            <Card className="group cursor-pointer border-white/5 bg-white/[0.02] transition hover:border-emerald-500/30" onClick={() => setDeployType('upload')}>
              <CardContent className="flex flex-col items-center p-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
                  <FileUp className="h-7 w-7" />
                </div>
                <h3 className="mt-3 font-bold text-zinc-100">Upload Template</h3>
                <p className="mt-1 text-xs text-zinc-500">Upload your own game file (max 1MB)</p>
              </CardContent>
            </Card>
            <Card className="group cursor-pointer border-white/5 bg-white/[0.02] transition hover:border-emerald-500/30" onClick={() => setDeployType('external')}>
              <CardContent className="flex flex-col items-center p-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-500/10 text-purple-300">
                  <Link2 className="h-7 w-7" />
                </div>
                <h3 className="mt-3 font-bold text-zinc-100">External Game</h3>
                <p className="mt-1 text-xs text-zinc-500">Link an external game to the platform</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Step 2: Configure deployment */}
      {deployType && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
              {deployType === 'template' && 'Select a template'}
              {deployType === 'upload' && 'Upload your game file'}
              {deployType === 'external' && 'Link external game'}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setDeployType(null)} className="text-zinc-400">
              ← Back
            </Button>
          </div>

          {/* Game title */}
          <div>
            <Label htmlFor="title">Game Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Awesome Game" className="mt-1 border-white/10 bg-white/[0.03] text-zinc-100" />
          </div>

          {/* Template selection */}
          {deployType === 'template' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <Card
                  key={t.id}
                  className={`cursor-pointer border-2 transition ${selectedTemplate === t.id ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02] hover:border-emerald-500/20'}`}
                  onClick={() => setSelectedTemplate(t.id)}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="text-3xl">{t.icon}</div>
                    <div>
                      <div className="font-medium text-zinc-100">{t.name}</div>
                      <div className="text-xs text-zinc-500">{t.desc}</div>
                    </div>
                    {selectedTemplate === t.id && <CheckCircle className="ml-auto h-5 w-5 text-emerald-400" />}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Upload */}
          {deployType === 'upload' && (
            <div className="space-y-4">
              <Card className="border-dashed border-white/10 bg-white/[0.02]">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Upload className="h-10 w-10 text-zinc-600" />
                  <p className="mt-3 text-sm text-zinc-400">Upload a game file (HTML, max 1MB)</p>
                  <Input type="file" accept=".html,.htm" onChange={handleFileUpload} className="mt-4 max-w-xs border-white/10 bg-white/[0.03] text-zinc-100" />
                  {fileName && (
                    <Badge className="mt-3 bg-emerald-500/20 text-emerald-300">
                      <CheckCircle className="mr-1 h-3 w-3" /> {fileName}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* External link */}
          {deployType === 'external' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="url">External Game URL</Label>
                <Input
                  id="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://my-game.com/play"
                  className="mt-1 border-white/10 bg-white/[0.03] text-zinc-100"
                />
              </div>
              <Card className="border-white/5 bg-white/[0.02]">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-cyan-400" />
                    <div className="text-sm text-zinc-400">
                      <p>When you link an external game:</p>
                      <ul className="mt-2 list-disc pl-4 text-xs text-zinc-500">
                        <li>Players access it through PlayLiquid's game player</li>
                        <li>Scores are tracked via our scoring API</li>
                        <li>Leaderboard rankings are updated automatically</li>
                        <li>Sessions and playtime are recorded</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Deploy button */}
          <div className="flex gap-3">
            <Button
              onClick={handleDeploy}
              disabled={loading || !title.trim() || (deployType === 'template' && !selectedTemplate) || (deployType === 'external' && !externalUrl) || (deployType === 'upload' && !fileData)}
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Deploy Game
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
