import { useEffect, useMemo, useState } from 'react'
import BarChart from './BarChart'
import { getGameModeStats } from '../store/profileStats'
import { allGames } from '../utils/games'

const OWNER_EMAIL = 'daviesfamily108@gmail.com'

export default function AdminDashboard({ user }: { user: any }) {
	const [admins, setAdmins] = useState<string[]>([])
	const [email, setEmail] = useState('')
	const [status, setStatus] = useState<any>(null)
	const [announcement, setAnnouncement] = useState('')
	const [loading, setLoading] = useState(false)
	const [tournaments, setTournaments] = useState<any[]>([])
		const [withdrawals, setWithdrawals] = useState<any[]>([])
	const [userSearch, setUserSearch] = useState('')
	const [userResults, setUserResults] = useState<any[]>([])
	const [createForm, setCreateForm] = useState<any>({
		title: 'Official Tournament',
		game: 'X01',
		mode: 'bestof',
		value: 3,
		description: '',
		startAt: new Date(Date.now() + 2*60*60*1000).toISOString().slice(0,16),
		checkinMinutes: 30,
		capacity: 16,
		prizeType: 'premium',
		prizeAmount: 0,
			currency: 'GBP',
		prizeNotes: '',
	})
	const [emailCopy, setEmailCopy] = useState<any>({ reset:{}, reminder:{}, confirmEmail:{}, changed:{} })
	const [preview, setPreview] = useState<{ open: boolean, kind?: string, html?: string }>({ open: false })
	const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL
  const [winners, setWinners] = useState<any[]>([])
		const [reports, setReports] = useState<any[]>([])

	// --- Game usage (played/won per mode) ---
	const [gmVersion, setGmVersion] = useState(0)
	useEffect(() => {
		const on = () => setGmVersion(v => v + 1)
		window.addEventListener('ndn:stats-updated', on as any)
		return () => window.removeEventListener('ndn:stats-updated', on as any)
	}, [])
	const gmStats = useMemo(() => getGameModeStats(allGames as unknown as string[]), [gmVersion])
	const gmBars = useMemo(() => (
		(allGames as unknown as string[]).map(mode => ({ label: mode, value: gmStats[mode]?.played || 0, won: gmStats[mode]?.won || 0 }))
	), [gmStats])

	async function refresh() {
		try {
			const res = await fetch('/api/admins')
			const data = await res.json()
			setAdmins(Array.isArray(data.admins) ? data.admins : [])
			if (isOwner) {
				const sres = await fetch(`/api/admin/status?requesterEmail=${encodeURIComponent(user?.email || '')}`)
				if (sres.ok) setStatus(await sres.json())
				const tres = await fetch(`/api/admin/tournaments?requesterEmail=${encodeURIComponent(user?.email || '')}`)
        if (tres.ok) {
          const td = await tres.json()
          setTournaments(Array.isArray(td.tournaments) ? td.tournaments : [])
        }
				const rres = await fetch(`/api/admin/reports?requesterEmail=${encodeURIComponent(user?.email || '')}`)
				if (rres.ok) {
					const rd = await rres.json()
					setReports(Array.isArray(rd.reports) ? rd.reports : [])
				}
				const pw = await fetch(`/api/admin/premium-winners?requesterEmail=${encodeURIComponent(user?.email||'')}`)
				if (pw.ok) {
					const d = await pw.json()
					setWinners(Array.isArray(d.winners) ? d.winners : [])
				}
						const wres = await fetch(`/api/admin/wallet/withdrawals?requesterEmail=${encodeURIComponent(user?.email || '')}`)
						if (wres.ok) {
							const wd = await wres.json()
							setWithdrawals(Array.isArray(wd.withdrawals) ? wd.withdrawals : [])
						}
			}
		} catch {}
	}

	useEffect(() => { refresh() }, [])

	async function grant() {
		if (!email) return
		await fetch('/api/admins/grant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, requesterEmail: user?.email }) })
		setEmail('')
		refresh()
	}
	async function revoke(target: string) {
		await fetch('/api/admins/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: target, requesterEmail: user?.email }) })
		refresh()
	}

	async function grantPremium(email: string, days: number) {
		if (!email) return
		await fetch('/api/admin/premium/grant', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, days, requesterEmail: user?.email }) })
		await refresh()
	}
	async function revokePremium(email: string) {
		await fetch('/api/admin/premium/revoke', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, requesterEmail: user?.email }) })
		await refresh()
	}

	async function toggleMaintenance(enabled: boolean) {
		setLoading(true)
		try {
			await fetch('/api/admin/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, requesterEmail: user?.email }) })
			await refresh()
		} finally { setLoading(false) }
	}

	async function sendAnnouncement() {
		if (!announcement.trim()) return
		setLoading(true)
		try {
			await fetch('/api/admin/announce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: announcement, requesterEmail: user?.email }) })
			setAnnouncement('')
			await refresh()
		} finally { setLoading(false) }
	}

	async function flipPremium(next: boolean) {
		setLoading(true)
		try {
			await fetch('/api/admin/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullAccess: next, requesterEmail: user?.email }) })
			await refresh()
		} finally { setLoading(false) }
	}

	async function createOfficialTournament() {
		setLoading(true)
		try {
			const start = new Date(createForm.startAt).getTime()
			await fetch('/api/tournaments/create', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: createForm.title,
					game: createForm.game,
					mode: createForm.mode,
					value: Number(createForm.value),
					description: createForm.description,
					startAt: start,
					checkinMinutes: Number(createForm.checkinMinutes),
					capacity: Number(createForm.capacity),
					creatorEmail: user?.email,
					creatorName: user?.username,
					requesterEmail: user?.email,
					official: true,
					prizeType: createForm.prizeType,
					prizeAmount: Number(createForm.prizeAmount||0),
					currency: createForm.currency,
					prizeNotes: createForm.prizeNotes,
				})
			})
			await refresh()
		} finally { setLoading(false) }
	}

	async function setWinner(tid: string, winnerEmail: string) {
		setLoading(true)
		try {
			await fetch('/api/admin/tournaments/winner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: tid, winnerEmail, requesterEmail: user?.email }) })
			await refresh()
		} finally { setLoading(false) }
	}

	async function markPaid(tid: string) {
		setLoading(true)
		try {
			await fetch('/api/admin/tournaments/mark-paid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: tid, requesterEmail: user?.email }) })
			await refresh()
		} finally { setLoading(false) }
	}

	async function deleteTournament(tid: string) {
		setLoading(true)
		try {
			await fetch('/api/admin/tournaments/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: tid, requesterEmail: user?.email }) })
			await refresh()
		} finally { setLoading(false) }
	}

	async function reseedWeekly() {
		setLoading(true)
		try {
			await fetch('/api/admin/tournaments/reseed-weekly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requesterEmail: user?.email }) })
			await refresh()
		} finally { setLoading(false) }
	}

		async function decideWithdrawal(id: string, approve: boolean) {
			setLoading(true)
			try {
				await fetch('/api/admin/wallet/withdrawals/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, approve, requesterEmail: user?.email }) })
				await refresh()
			} finally { setLoading(false) }
		}

	async function deleteMatch(id: string) {
		setLoading(true)
		try {
			await fetch('/api/admin/matches/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: id, requesterEmail: user?.email }) })
			await refresh()
		} finally { setLoading(false) }
	}

	async function loadEmailCopy() {
		try {
			const res = await fetch(`/api/admin/email-copy?requesterEmail=${encodeURIComponent(user?.email||'')}`)
			if (res.ok) {
				const d = await res.json()
				if (d?.ok) setEmailCopy(d.copy || emailCopy)
			}
		} catch {}
	}
	useEffect(()=>{ if (isOwner) loadEmailCopy() }, [isOwner])

	async function saveEmailCopy(kind: string, payload: any) {
		await fetch('/api/admin/email-copy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ requesterEmail: user?.email, kind, ...payload }) })
		await loadEmailCopy()
	}

	async function openInlinePreview(kind: string) {
		try {
			const res = await fetch(`/api/email/preview?kind=${encodeURIComponent(kind)}&requesterEmail=${encodeURIComponent(user?.email||'')}`)
			const html = await res.text()
			setPreview({ open: true, kind, html })
		} catch {
			setPreview({ open: true, kind, html: '<!doctype html><html><body style="font-family:sans-serif;padding:16px">Failed to load preview.</body></html>' })
		}
	}

	useEffect(() => {
		if (!preview.open) return
		function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPreview({ open: false }) }
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [preview.open])

	function EmailEditor({ kind, label }: { kind:string, label:string }) {
		const key = kind === 'confirm-email' ? 'confirmEmail' : (kind === 'changed' ? 'changed' : kind)
		const cfg = emailCopy?.[key] || { title:'', intro:'', buttonLabel:'' }
		const [title, setTitle] = useState(cfg.title||'')
		const [intro, setIntro] = useState(cfg.intro||'')
		const [btn, setBtn] = useState(cfg.buttonLabel||'')
		useEffect(()=>{ setTitle(cfg.title||''); setIntro(cfg.intro||''); setBtn(cfg.buttonLabel||'') }, [cfg.title, cfg.intro, cfg.buttonLabel])

		return (
			<div className="p-2 rounded bg-black/20 space-y-2">
				<div className="font-semibold">{label}</div>
				<input className="input w-full" placeholder="Title (optional)" value={title} onChange={e=>setTitle(e.target.value)} />
				<textarea className="input w-full" rows={2} placeholder="Intro line (optional)" value={intro} onChange={e=>setIntro(e.target.value)} />
				<input className="input w-full" placeholder="Button label (optional)" value={btn} onChange={e=>setBtn(e.target.value)} />
				<div className="flex gap-2 justify-end">
					<a className="btn" href={`/api/email/preview?kind=${encodeURIComponent(kind)}&requesterEmail=${encodeURIComponent(user?.email||'')}`} target="_blank" rel="noreferrer">Preview</a>
					<button className="btn" type="button" onClick={()=>openInlinePreview(kind)}>Popup</button>
					<button className="btn" onClick={()=>saveEmailCopy(kind, { title, intro, buttonLabel: btn })}>Save</button>
				</div>
			</div>
		)
	}

	if (!isOwner) return (
		<div className="card">
			<h2 className="text-2xl font-bold mb-2">Admin</h2>
			<div className="text-sm opacity-80">You don’t have permission to manage admins.</div>
		</div>
	)

	return (
		<div className="space-y-4">
			{isOwner && (
				<div className="card">
					<h3 className="text-xl font-semibold mb-2">Game Usage</h3>
					<div className="text-sm opacity-80 mb-2">Bar height shows total plays per mode. Wins are listed under each label. This helps decide which modes to keep or iterate on.</div>
					<div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3">
						<BarChart data={gmBars.map(d => ({ label: d.label, value: d.value }))} />
						<div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px] opacity-80">
										{gmBars.map((d, i) => (
											<div key={i} className="flex items-center justify-between px-2 py-1 rounded-md bg-white/5 border border-white/10">
												<span className="truncate mr-2">{d.label}</span>
												<span className="whitespace-nowrap">Played {d.value} · Won {d.won}</span>
											</div>
										))}
									</div>
								</div>
							</div>
						)}

						<div className="card">
				<h2 className="text-2xl font-bold mb-2">Admin Control</h2>
				<div className="text-sm opacity-80 mb-3">Grant or revoke Admin to trusted users. Only the owner can perform these actions.</div>
				<div className="flex gap-2 mb-3">
					<input className="input flex-1" placeholder="user@example.com" value={email} onChange={e=>setEmail(e.target.value)} />
					<button className="btn" onClick={grant} disabled={!email}>Grant Admin</button>
				</div>
				<div>
					<div className="font-semibold mb-1">Current Admins</div>
					<ul className="space-y-1">
						{admins.map(a => (
							<li key={a} className="flex items-center justify-between p-2 rounded bg-black/20">
								<span>{a}</span>
								{a.toLowerCase() !== OWNER_EMAIL && (
									<button className="btn bg-rose-600 hover:bg-rose-700" onClick={()=>revoke(a)}>Revoke</button>
								)}
							</li>
						))}
						{admins.length === 0 && <li className="text-sm opacity-60">No admins yet.</li>}
					</ul>
				</div>
			</div>

			{isOwner && (
				<div className="card">
					<h3 className="text-xl font-semibold mb-2">Premium Overrides</h3>
					<div className="text-sm opacity-80 mb-2">Grant temporary PREMIUM to specific emails (e.g., winners, testers). Owner only.</div>
					<div className="flex gap-2 mb-3">
						<input className="input flex-1" placeholder="user@example.com" value={email} onChange={e=>setEmail(e.target.value)} />
						<input className="input w-28" type="number" min={1} defaultValue={30} onChange={()=>{}} id="ndn-premium-days" placeholder="Days" />
						<button className="btn" onClick={()=>{
							const el = document.getElementById('ndn-premium-days') as HTMLInputElement | null
							const days = Number(el?.value || '30')
							grantPremium(email, Number.isFinite(days) ? days : 30)
						}} disabled={!email}>Grant</button>
					</div>
					<div>
						<div className="font-semibold mb-1">Active Overrides</div>
						<ul className="space-y-1 text-sm">
							{winners.map(w => (
								<li key={w.email} className="flex items-center justify-between p-2 rounded bg-black/20">
									<div>
										<div>{w.email}</div>
										<div className="text-xs opacity-70">Expires: {w.expiresAt ? new Date(w.expiresAt).toLocaleString() : '—'} {w.expired ? '(expired)' : ''}</div>
									</div>
									<button className="btn bg-rose-600 hover:bg-rose-700" onClick={()=>revokePremium(w.email)}>Revoke</button>
								</li>
							))}
							{winners.length===0 && <li className="opacity-60">No overrides.</li>}
						</ul>
					</div>
				</div>
			)}

			{isOwner && (
				<div className="card">
					<h3 className="text-xl font-semibold mb-2">Server status</h3>
					{status?.ok ? (
						<div className="text-sm grid grid-cols-2 gap-2">
							<div>Clients: <span className="font-semibold">{status.server.clients}</span></div>
							<div>Open matches: <span className="font-semibold">{status.server.matches}</span></div>
							<div>Rooms: <span className="font-semibold">{status.server.rooms}</span></div>
							<div>Premium: <span className="font-semibold">{status.server.premium ? 'ON' : 'OFF'}</span></div>
							<div>Maintenance: <span className="font-semibold">{status.server.maintenance ? 'ON' : 'OFF'}</span></div>
						</div>
					) : (
						<div className="text-sm opacity-70">Loading…</div>
					)}
				</div>
			)}

			{isOwner && (
				<div className="card">
					<h3 className="text-xl font-semibold mb-3">Operations</h3>
					<div className="flex flex-wrap gap-2 items-center mb-3">
						<button className="btn" disabled={loading} onClick={()=>toggleMaintenance(!(status?.server?.maintenance))}>
							{status?.server?.maintenance ? 'Disable Maintenance' : 'Enable Maintenance'}
						</button>
						<button className="btn" disabled={loading} onClick={()=>flipPremium(!(status?.server?.premium))}>
							{status?.server?.premium ? 'Disable PREMIUM' : 'Enable PREMIUM'}
						</button>
					</div>
					<div className="flex gap-2">
						<input className="input flex-1" placeholder="Announcement message" value={announcement} onChange={e=>setAnnouncement(e.target.value)} />
						<button className="btn" disabled={loading || !announcement.trim()} onClick={sendAnnouncement}>Broadcast</button>
					</div>
				</div>
			)}

			{isOwner && (
				<div className="card">
					<h3 className="text-xl font-semibold mb-3">User Management</h3>
					<div className="mb-4">
						<input className="input w-full mb-2" placeholder="Search user by email or username" value={userSearch} onChange={e=>setUserSearch(e.target.value)} />
						<button className="btn" onClick={searchUsers}>Search</button>
					</div>
					{userResults.length > 0 && (
						<div className="space-y-2">
							{userResults.map(u => (
								<div key={u.email} className="flex items-center justify-between p-2 bg-slate-700 rounded">
									<div>
										<div className="font-medium">{u.username || 'No username'}</div>
										<div className="text-sm text-slate-300">{u.email}</div>
										<div className="text-xs text-slate-400">Joined: {new Date(u.created_at).toLocaleDateString()}</div>
									</div>
									<div className="flex gap-2">
										<button className="btn bg-red-600 hover:bg-red-700 text-xs" onClick={()=>banUser(u.email)}>Ban</button>
										<button className="btn bg-green-600 hover:bg-green-700 text-xs" onClick={()=>unbanUser(u.email)}>Unban</button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{isOwner && (
				<div className="card">
					<h3 className="text-xl font-semibold mb-3">Tournaments Management</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<div className="font-semibold mb-2">Create Official</div>
							<div className="space-y-2">
								<input className="input w-full" placeholder="Title" value={createForm.title} onChange={e=>setCreateForm((f:any)=>({ ...f, title: e.target.value }))} />
								<div className="grid grid-cols-3 gap-2">
									<select className="input" value={createForm.game} onChange={e=>setCreateForm((f:any)=>({ ...f, game: e.target.value }))}>
										{['X01','Around the Clock','Cricket','Halve It','Shanghai','High-Low'].map((g)=> <option key={g} value={g}>{g}</option>)}
									</select>
									<select className="input" value={createForm.mode} onChange={e=>setCreateForm((f:any)=>({ ...f, mode: e.target.value }))}>
										<option value="bestof">Best of</option>
										<option value="firstto">First to</option>
									</select>
									<input className="input" type="number" min={1} value={createForm.value} onChange={e=>setCreateForm((f:any)=>({ ...f, value: Number(e.target.value) }))} />
								</div>
								<textarea className="input w-full" rows={2} placeholder="Description" value={createForm.description} onChange={e=>setCreateForm((f:any)=>({ ...f, description: e.target.value }))} />
								<div className="grid grid-cols-2 gap-2">
									<input className="input" type="datetime-local" value={createForm.startAt} onChange={e=>setCreateForm((f:any)=>({ ...f, startAt: e.target.value }))} />
									<input className="input" type="number" min={0} value={createForm.checkinMinutes} onChange={e=>setCreateForm((f:any)=>({ ...f, checkinMinutes: Number(e.target.value) }))} />
								</div>
								<input className="input w-full" type="number" min={6} max={64} value={createForm.capacity} onChange={e=>setCreateForm((f:any)=>({ ...f, capacity: Number(e.target.value) }))} />
								<div className="grid grid-cols-3 gap-2 items-center">
									<select className="input" value={createForm.prizeType} onChange={e=>setCreateForm((f:any)=>({ ...f, prizeType: e.target.value }))}>
										<option value="premium">PREMIUM month</option>
										<option value="cash">Cash</option>
									</select>
														<input className="input" type="number" min={0} disabled={createForm.prizeType!=='cash'} value={createForm.prizeAmount} onChange={e=>setCreateForm((f:any)=>({ ...f, prizeAmount: Number(e.target.value) }))} />
														<select className="input" disabled={createForm.prizeType!=='cash'} value={createForm.currency} onChange={e=>setCreateForm((f:any)=>({ ...f, currency: e.target.value }))}>
															<option value="GBP">GBP</option>
															<option value="USD">USD</option>
															<option value="EUR">EUR</option>
															<option value="CAD">CAD</option>
															<option value="AUD">AUD</option>
														</select>
								</div>
								<input className="input w-full" placeholder="Prize notes (optional)" value={createForm.prizeNotes} onChange={e=>setCreateForm((f:any)=>({ ...f, prizeNotes: e.target.value }))} />
								<div className="flex justify-end">
									<button className="btn" disabled={loading} onClick={createOfficialTournament}>Create</button>
								</div>
							</div>
						</div>
						<div>
							<div className="font-semibold mb-2">Existing</div>
							<ul className="space-y-2">
								{tournaments.map((t:any)=> (
									<li key={t.id} className="p-2 rounded bg-black/20 text-sm">
										<div className="flex items-center justify-between">
											<div className="font-semibold">{t.title}</div>
											<div className="opacity-70">{t.status}</div>
										</div>
										<div className="opacity-80">{t.game} · {t.mode==='firstto'?'FT':'BO'} {t.value} · {new Date(t.startAt).toLocaleString()} · {t.capacity} cap</div>
										{t.prize && (
											<div className="text-xs mt-1">Prize: {t.prizeType==='cash' && t.prizeAmount ? `${t.currency||'USD'} ${t.prizeAmount}` : '1 month PREMIUM'} {t.prizeType==='cash' && t.status==='completed' && t.payoutStatus && (<span className={`ml-2 px-1.5 py-0.5 rounded ${t.payoutStatus==='paid'?'bg-emerald-600':'bg-amber-600'}`}>{t.payoutStatus}</span>)}</div>
										)}

												{isOwner && (
													<div className="card">
														<h3 className="text-xl font-semibold mb-3">Withdrawals</h3>
														<ul className="space-y-2">
															{withdrawals.map((w:any) => (
																<li key={w.id} className="p-2 rounded bg-black/20 text-sm flex items-center justify-between">
																	<div>
																		<div className="font-mono text-xs">{w.id}</div>
																		<div>{w.email} · {w.currency} {(w.amountCents/100).toFixed(2)}</div>
																		<div className="opacity-70">{w.status} · {new Date(w.requestedAt).toLocaleString()}</div>
																	</div>
																	<div className="flex gap-2">
																		{w.status==='pending' && (
																			<>
																				<button className="btn bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={()=>decideWithdrawal(w.id, true)}>Approve</button>
																				<button className="btn bg-rose-600 hover:bg-rose-700" disabled={loading} onClick={()=>decideWithdrawal(w.id, false)}>Reject</button>
																			</>
																		)}
																	</div>
																</li>
															))}
															{withdrawals.length===0 && <li className="opacity-60">No withdrawal requests.</li>}
														</ul>
													</div>
												)}
										<div className="mt-2 flex flex-wrap gap-2">
											<button className="btn" disabled={loading || t.status!=='scheduled'} onClick={()=>setWinner(t.id, prompt('Winner email?')||'')}>Set Winner</button>
											{t.prizeType==='cash' && t.status==='completed' && t.payoutStatus!=='paid' && (
												<button className="btn" disabled={loading} onClick={()=>markPaid(t.id)}>Mark Paid</button>
											)}
											<button className="btn bg-rose-600 hover:bg-rose-700" disabled={loading} onClick={()=>deleteTournament(t.id)}>Delete</button>
										</div>
									</li>
								))}
								{tournaments.length===0 && <li className="opacity-60">No tournaments.</li>}
							</ul>
							<div className="mt-3 flex justify-end">
								<button className="btn" disabled={loading} onClick={reseedWeekly}>Reseed Weekly Giveaway</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{isOwner && (
				<div className="card">
							<h3 className="text-xl font-semibold mb-3">User Reports</h3>
							<ul className="space-y-2">
								{reports.map((r:any)=> (
									<li key={r.id} className="p-2 rounded bg-black/20 text-sm">
										<div className="flex items-center justify-between">
											<div>
												<div className="font-mono text-xs">{r.id}</div>
												<div><span className="font-semibold">{r.reporter}</span> → <span className="font-semibold">{r.offender}</span> · {new Date(r.ts).toLocaleString()}</div>
												<div className="opacity-80">Reason: {r.reason}</div>
												{r.messageId && <div className="opacity-60 text-xs">Message ID: {r.messageId}</div>}
											</div>
											<div className="flex gap-2">
												<span className={`px-2 py-0.5 rounded text-xs ${r.status==='open'?'bg-amber-600':'bg-emerald-600'}`}>{r.status}</span>
												{r.status==='open' && (
													<>
														<button className="btn bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={async()=>{
															await fetch('/api/admin/reports/resolve', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: r.id, action: 'resolved', requesterEmail: user?.email }) })
															await refresh()
														}}>Resolve</button>
														<button className="btn bg-rose-600 hover:bg-rose-700" disabled={loading} onClick={async()=>{
															const notes = prompt('Enter notes for action taken (e.g., warning, block):') || ''
															await fetch('/api/admin/reports/resolve', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: r.id, action: 'actioned', notes, requesterEmail: user?.email }) })
															await refresh()
														}}>Action</button>
													</>
												)}
											</div>
										</div>
									</li>
								))}
								{reports.length===0 && <li className="opacity-60">No reports.</li>}
							</ul>
						</div>
					)}

					{isOwner && (
						<div className="card">
					<h3 className="text-xl font-semibold mb-2">Open Matches</h3>
					<ul className="space-y-1">
						{(status?.matches || []).map((m: any) => (
							<li key={m.id} className="flex items-center justify-between p-2 rounded bg-black/20 text-sm">
								<div className="flex items-center gap-3">
									<span className="font-mono text-xs">{m.id}</span>
									<span className="opacity-80">{m.creatorName}</span>
									<span className="opacity-60">{m.game} {m.mode==='firstto'?'FT':'BO'} {m.value} {m.game==='X01'?`/${m.startingScore}`:''}</span>
								</div>
								<button className="btn bg-rose-600 hover:bg-rose-700" disabled={loading} onClick={()=>deleteMatch(m.id)}>Remove</button>
							</li>
						))}
						{(!status?.matches || status.matches.length === 0) && (
							<li className="text-sm opacity-60">No open matches.</li>
						)}
					</ul>
				</div>
			)}

			{isOwner && (
				<div className="card">
					<h3 className="text-xl font-semibold mb-3">Email Templates</h3>
					<div className="text-sm opacity-80 mb-2">Customize titles, intro lines, and button text. Previews open in a new tab or as a popup.</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<EmailEditor kind="reset" label="Password reset" />
						<EmailEditor kind="reminder" label="Password reset reminder" />
						<EmailEditor kind="confirm-email" label="Confirm new email" />
						<EmailEditor kind="changed" label="Password changed notice" />
					</div>
				</div>
			)}

			{/* Inline email preview overlay */}
			{preview.open && (
				<div className="fixed inset-0 z-[1000]" onClick={()=>setPreview({ open: false })}>
					<div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
					<div className="absolute inset-0 p-4 md:p-8 overflow-auto flex items-start md:items-center justify-center">
						<div className="w-full max-w-3xl bg-[#0b1020] rounded-2xl border border-indigo-500/40 shadow-2xl" onClick={e=>e.stopPropagation()}>
							<div className="flex items-center justify-between px-4 py-3 border-b border-indigo-500/20">
								<div className="font-semibold">Preview: {preview.kind}</div>
								<button className="btn" onClick={()=>setPreview({ open: false })}>Close</button>
							</div>
							<div className="p-0 bg-black/30">
								<iframe title="Email Preview" style={{ width: '100%', height: '70vh', border: '0', background: 'transparent' }} srcDoc={preview.html || ''} />
							</div>
							<div className="px-4 py-3 border-t border-indigo-500/20 text-xs opacity-70">Click outside this panel or press Esc to close.</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

// Inline preview overlay (click anywhere to close)
// Rendered at the bottom of AdminDashboard via a fragment – integrated above with state
