'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface CampaignRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  pdfUrl: string | null;
  linkedinPostUrl: string | null;
}

interface Campaign {
  id: string;
  topic: string;
  tonePersona: string | null;
  frequency: string;
  status: string;
  nextRunAt: string;
  runs: CampaignRun[];
}

interface LinkedInStatus {
  connected: boolean;
  expired: boolean;
  linkedinUrn: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [linkedin, setLinkedin] = useState<LinkedInStatus>({ connected: false, expired: false, linkedinUrn: null });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [topic, setTopic] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [tonePersona, setTonePersona] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Detail Expansion State
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    try {
      // 1. Fetch User Session
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email || null);

      // 2. Fetch LinkedIn Connection Status
      const linkedinRes = await fetch('/api/auth/linkedin/status');
      if (linkedinRes.ok) {
        const linkedinData = await linkedinRes.json();
        setLinkedin(linkedinData);
      }

      // 3. Fetch Campaigns List
      const campaignsRes = await fetch('/api/campaigns');
      if (campaignsRes.ok) {
        const campaignsData = await campaignsRes.json();
        setCampaigns(campaignsData);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    setActionLoading(id);
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCampaigns(prev =>
          prev.map(c => (c.id === id ? { ...c, status: newStatus } : c))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This cannot be undone.')) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCampaigns(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!topic || !frequency) {
      setFormError('Please provide both a topic and frequency.');
      return;
    }

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, frequency, tonePersona, timezone }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create campaign');
      }

      // Reset Form
      setTopic('');
      setFrequency('daily');
      setTonePersona('');
      setShowModal(false);

      // Refresh Data
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred.');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedCampaigns(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 selection:bg-blue-600/30 selection:text-blue-200 relative">
      {/* Background radial accent glow */}
      <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-indigo-600/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Navigation */}
      <nav className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/10 rounded-lg border border-blue-500/20">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="font-bold text-neutral-50 tracking-tight text-lg">Rorays SaaS</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-400 hidden sm:inline">{userEmail}</span>
            <button
              onClick={handleSignOut}
              className="text-sm bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium px-4 py-2 rounded-xl transition-all border border-neutral-800"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 relative z-10">
        
        {/* LinkedIn Connection Banner */}
        <div className="bg-neutral-900/40 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-neutral-50">LinkedIn Integration</h2>
              {linkedin.connected ? (
                linkedin.expired ? (
                  <span className="px-2 py-0.5 bg-red-950/60 border border-red-900 text-red-400 text-xs font-semibold rounded-md">Token Expired</span>
                ) : (
                  <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-900 text-emerald-400 text-xs font-semibold rounded-md">Connected</span>
                )
              ) : (
                <span className="px-2 py-0.5 bg-neutral-800/80 border border-neutral-700 text-neutral-400 text-xs font-semibold rounded-md">Not Connected</span>
              )}
            </div>
            <p className="text-sm text-neutral-400">
              {linkedin.connected 
                ? `Active account URN: ${linkedin.linkedinUrn}` 
                : 'Connect your LinkedIn account to publish carousels automatically.'}
            </p>
          </div>

          <div>
            <a
              href="/api/auth/linkedin"
              className={`inline-flex items-center justify-center font-medium py-2.5 px-5 rounded-xl transition-all text-sm shadow-md ${
                linkedin.connected && !linkedin.expired
                  ? 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                  : 'bg-blue-600 hover:bg-blue-500 text-neutral-50'
              }`}
            >
              {linkedin.connected ? 'Reconnect LinkedIn' : 'Connect LinkedIn'}
            </a>
          </div>
        </div>

        {/* Dashboard Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-neutral-50 tracking-tight">Campaigns</h1>
            <p className="text-sm text-neutral-400 mt-1">Manage carousel generations and run histories</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-neutral-50 font-medium py-2.5 px-5 rounded-xl transition-all text-sm shadow-lg shadow-blue-900/20 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Campaign
          </button>
        </div>

        {/* Campaigns Grid */}
        {campaigns.length === 0 ? (
          <div className="bg-neutral-900/20 border border-neutral-900/60 rounded-2xl p-12 text-center">
            <div className="w-12 h-12 bg-neutral-950 border border-neutral-850 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="font-semibold text-neutral-200">No campaigns found</h3>
            <p className="text-sm text-neutral-500 mt-2">Create your first automated content campaign to get started!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map(campaign => (
              <div
                key={campaign.id}
                className="bg-neutral-900/60 border border-neutral-800/80 backdrop-blur-md rounded-2xl overflow-hidden transition-all shadow-lg"
              >
                {/* Main Row */}
                <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-bold text-neutral-100">{campaign.topic}</h3>
                      <span className="px-2.5 py-0.5 bg-blue-950/60 border border-blue-900/60 text-blue-400 text-xs font-semibold rounded-full uppercase tracking-wider">
                        {campaign.frequency.replace('_', ' ')}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${
                        campaign.status === 'active'
                          ? 'bg-emerald-950/60 border-emerald-900 text-emerald-400'
                          : 'bg-neutral-850 border-neutral-700 text-neutral-400'
                      }`}>
                        {campaign.status}
                      </span>
                    </div>
                    
                    <p className="text-sm text-neutral-400 mt-2">
                      {campaign.tonePersona ? `Persona: ${campaign.tonePersona}` : 'Default tone'} &middot; Next run: {new Date(campaign.nextRunAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    <button
                      onClick={() => toggleExpand(campaign.id)}
                      className="px-4 py-2 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 font-medium text-sm rounded-xl border border-neutral-800 flex items-center gap-2"
                    >
                      History ({campaign.runs.length})
                      <svg className={`w-4 h-4 text-neutral-500 transition-transform ${expandedCampaigns[campaign.id] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    <button
                      disabled={actionLoading === campaign.id}
                      onClick={() => handleToggleStatus(campaign.id, campaign.status)}
                      className={`px-4 py-2 font-medium text-sm rounded-xl transition-all border ${
                        campaign.status === 'active'
                          ? 'bg-neutral-950 hover:bg-neutral-900 border-neutral-850 text-neutral-400'
                          : 'bg-blue-600/10 hover:bg-blue-600/20 border-blue-500/20 text-blue-400'
                      }`}
                    >
                      {campaign.status === 'active' ? 'Pause' : 'Resume'}
                    </button>

                    <button
                      disabled={actionLoading === campaign.id}
                      onClick={() => handleDeleteCampaign(campaign.id)}
                      className="p-2 bg-neutral-950 hover:bg-red-950/40 text-neutral-500 hover:text-red-400 border border-neutral-800 hover:border-red-900/60 rounded-xl transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expanded Run History */}
                {expandedCampaigns[campaign.id] && (
                  <div className="border-t border-neutral-850 bg-neutral-950/40 px-6 py-4">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Execution Log</h4>
                    {campaign.runs.length === 0 ? (
                      <p className="text-sm text-neutral-600 italic">No executions have run yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-neutral-300">
                          <thead>
                            <tr className="border-b border-neutral-900 text-neutral-500 font-semibold text-xs">
                              <th className="py-2">Date/Time</th>
                              <th className="py-2">Status</th>
                              <th className="py-2">Output Assets</th>
                              <th className="py-2">Logs / Error Message</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-900/50">
                            {campaign.runs.map(run => (
                              <tr key={run.id} className="hover:bg-neutral-900/20">
                                <td className="py-3 text-neutral-400">
                                  {new Date(run.startedAt).toLocaleString()}
                                </td>
                                <td className="py-3">
                                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded ${
                                    run.status === 'success'
                                      ? 'bg-emerald-950/60 text-emerald-400'
                                      : run.status === 'failed'
                                      ? 'bg-red-950/60 text-red-400'
                                      : 'bg-blue-950/60 text-blue-400 animate-pulse'
                                  }`}>
                                    {run.status}
                                  </span>
                                </td>
                                <td className="py-3">
                                  <div className="flex gap-3">
                                    {run.pdfUrl && (
                                      <a
                                        href={run.pdfUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 hover:underline flex items-center gap-1"
                                      >
                                        PDF Carousel
                                      </a>
                                    )}
                                    {run.linkedinPostUrl && (
                                      <a
                                        href={run.linkedinPostUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 hover:underline flex items-center gap-1"
                                      >
                                        LinkedIn Share
                                      </a>
                                    )}
                                    {!run.pdfUrl && !run.linkedinPostUrl && <span className="text-neutral-600">—</span>}
                                  </div>
                                </td>
                                <td className="py-3 text-xs text-neutral-500 max-w-xs truncate">
                                  {run.error || <span className="text-neutral-700">None</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </main>

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl relative">
            <button
              onClick={() => {
                setShowModal(false);
                setFormError(null);
              }}
              className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-xl font-bold text-neutral-50 tracking-tight mb-5">Create New Campaign</h2>

            <form onSubmit={handleCreateCampaign} className="space-y-5">
              {formError && (
                <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-sm text-red-400">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Topic / Search Subject
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. AI Agent Architectures"
                  className="w-full bg-neutral-950 border border-neutral-800/80 rounded-xl px-4 py-3 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Posting Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800/80 rounded-xl px-4 py-3 text-neutral-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="3x_week">3x per Week</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Tone / Persona Override (Optional)
                </label>
                <input
                  type="text"
                  value={tonePersona}
                  onChange={(e) => setTonePersona(e.target.value)}
                  placeholder="e.g. Tech founder, witty and data-driven"
                  className="w-full bg-neutral-950 border border-neutral-800/80 rounded-xl px-4 py-3 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-neutral-50 font-medium py-3 px-4 rounded-xl transition-all shadow-lg text-sm flex items-center justify-center"
              >
                Create Campaign
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
