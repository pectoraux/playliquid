'use client';

/**
 * Reusable role page component.
 * Renders a consistent layout for all role-specific pages with demo data.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Loader2, type LucideIcon } from 'lucide-react';

interface PageConfig {
  title: string;
  description: string;
  icon: LucideIcon;
  role: string;
  sections?: PageSection[];
}

interface PageSection {
  title: string;
  type: 'stats' | 'table' | 'list' | 'cards';
  data?: unknown;
}

interface StatItem {
  label: string;
  value: string | number;
  sub?: string;
}

interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' };
}

interface CardItem {
  id: string;
  title: string;
  description: string;
  icon?: string;
  badge?: { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' };
  progress?: number;
}

export function RolePage({ config }: { config: PageConfig }) {
  const Icon = config.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/15">
          <Icon className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{config.title}</h1>
          <p className="text-sm text-zinc-500">{config.description}</p>
        </div>
      </div>

      {config.sections?.map((section, idx) => (
        <div key={idx} className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">{section.title}</h2>
          {section.type === 'stats' && <StatsGrid data={section.data as StatItem[]} />}
          {section.type === 'table' && <DataTable data={section.data as TableData} />}
          {section.type === 'list' && <ListSection data={section.data as ListItem[]} />}
          {section.type === 'cards' && <CardsSection data={section.data as CardItem[]} />}
        </div>
      ))}

      {!config.sections && (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Icon className="h-12 w-12 text-zinc-600" />
            <p className="mt-4 text-zinc-400">This page is part of the {config.role} experience.</p>
            <p className="text-sm text-zinc-600">Full functionality coming soon.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatsGrid({ data }: { data: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {data.map((stat) => (
        <Card key={stat.label} className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-zinc-100">{stat.value}</div>
            <div className="text-sm text-zinc-400">{stat.label}</div>
            {stat.sub && <div className="mt-1 text-xs text-zinc-600">{stat.sub}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DataTable({ data }: { data: TableData }) {
  return (
    <Card className="border-white/5 bg-white/[0.02]">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              {data.columns.map((col) => (
                <TableHead key={col} className="text-zinc-400">{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row, idx) => (
              <TableRow key={idx} className="border-white/5">
                {row.map((cell, cellIdx) => (
                  <TableCell key={cellIdx} className="text-zinc-200">{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ListSection({ data }: { data: ListItem[] }) {
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <Card key={item.id} className="border-white/5 bg-white/[0.02] transition hover:border-emerald-500/20">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium text-zinc-100">{item.title}</div>
              {item.subtitle && <div className="text-sm text-zinc-500">{item.subtitle}</div>}
            </div>
            {item.badge && <Badge variant={item.badge.variant}>{item.badge.text}</Badge>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CardsSection({ data }: { data: CardItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((card) => (
        <Card key={card.id} className="border-white/5 bg-white/[0.02] transition hover:border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-2xl">{card.icon}</div>
              {card.badge && <Badge variant={card.badge.variant}>{card.badge.text}</Badge>}
            </div>
            <div className="mt-3 font-medium text-zinc-100">{card.title}</div>
            <div className="text-sm text-zinc-500">{card.description}</div>
            {card.progress !== undefined && (
              <Progress value={card.progress} className="mt-3" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
