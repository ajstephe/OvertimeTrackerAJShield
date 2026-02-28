import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Home,
  PlusCircle,
  Settings as SettingsIcon,
  Edit2,
  Trash2,
  ArrowLeft,
  Save,
  PoundSterling,
  Clock,
  ChevronRight,
  Loader2,
  Calendar,
  BarChart3,
  UserPlus,
  CheckCircle2,
} from "lucide-react";

// Firebase Imports
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

// --- SAFE FIREBASE INITIALIZATION ---
let firebaseConfig = {};
try {
  if (typeof __firebase_config !== "undefined" && __firebase_config) {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (e) {
  console.warn("Could not parse Firebase config.");
}

const appId =
  typeof __app_id !== "undefined" && __app_id
    ? __app_id
    : "ajshieldpay-ot-tracker";

let isFirebaseValid = false;
let app, auth, db;

try {
  // Only attempt to initialize if we actually have an API key
  if (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey.trim() !== ""
  ) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseValid = true;
  }
} catch (e) {
  console.warn("Firebase skipped - running in Local Memory Mode.", e.message);
}

// --- CONFIG & DATA ---
const FY_START = "2026-02-09";
const FY_END = "2027-02-07";

const PAY_PERIODS = [
  { month: "April 2026", short: "Apr", start: "2026-02-09", end: "2026-03-08" },
  { month: "May 2026", short: "May", start: "2026-03-09", end: "2026-04-12" },
  { month: "June 2026", short: "Jun", start: "2026-04-13", end: "2026-05-10" },
  { month: "July 2026", short: "Jul", start: "2026-05-11", end: "2026-06-07" },
  {
    month: "August 2026",
    short: "Aug",
    start: "2026-06-08",
    end: "2026-07-12",
  },
  {
    month: "September 2026",
    short: "Sep",
    start: "2026-07-13",
    end: "2026-08-09",
  },
  {
    month: "October 2026",
    short: "Oct",
    start: "2026-08-10",
    end: "2026-09-06",
  },
  {
    month: "November 2026",
    short: "Nov",
    start: "2026-09-07",
    end: "2026-10-11",
  },
  {
    month: "December 2026",
    short: "Dec",
    start: "2026-10-12",
    end: "2026-11-08",
  },
  {
    month: "January 2027",
    short: "Jan",
    start: "2026-11-09",
    end: "2026-12-06",
  },
  {
    month: "February 2027",
    short: "Feb",
    start: "2026-12-07",
    end: "2027-01-10",
  },
  { month: "March 2027", short: "Mar", start: "2027-01-11", end: "2027-02-07" },
];

const PAY_RATES = {
  "Constable (Joined Pre 2013)": {
    "PC - Year 4": { r133: 25.688, r150: 28.906, r200: 38.541 },
    "PC - Year 5": { r133: 26.47, r150: 29.787, r200: 39.715 },
    "PC - Year 6": { r133: 28.677, r150: 32.27, r200: 43.027 },
    "PC - Year 7+": { r133: 30.91, r150: 34.782, r200: 46.376 },
  },
  "Constable (Joined Post 2013)": {
    "PC - Year 3": { r133: 20.781, r150: 23.385, r200: 31.18 },
    "PC - Year 4": { r133: 21.591, r150: 24.296, r200: 32.394 },
    "PC - Year 5": { r133: 23.21, r150: 26.117, r200: 34.823 },
    "PC - Year 6": { r133: 26.47, r150: 29.787, r200: 39.715 },
    "PC - Year 7+": { r133: 30.91, r150: 34.782, r200: 46.376 },
  },
  Sergeant: {
    "Sgt - Point 1": { r133: 32.946, r150: 37.073, r200: 49.431 },
    "Sgt - Point 2": { r133: 33.619, r150: 37.83, r200: 50.44 },
    "Sgt - Point 3+": { r133: 34.57, r150: 38.901, r200: 51.868 },
  },
};

const PA_RATES = { None: 0, PA1: 40, PA2: 90, PA3: 125 };

const getDefaultDate = () => {
  const today = new Date().toISOString().split("T")[0];
  return today >= FY_START && today <= FY_END ? today : FY_START;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState({
    rank: "",
    service: "",
    rates: { r133: 0, r150: 0, r200: 0 },
    taxRate: 40,
  });

  const [expandedMonth, setExpandedMonth] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const mainRef = useRef(null);

  const [formData, setFormData] = useState({
    date: getDefaultDate(),
    reason: "",
    hours133: "",
    hours150: "",
    hours200: "",
    paRate: "None",
    comments: "",
  });

  // 1. Initial Load (Local vs Firebase)
  useEffect(() => {
    if (!isFirebaseValid) {
      // Load from local storage if Firebase is off
      const savedEntries = localStorage.getItem("ot_tracker_entries");
      const savedSettings = localStorage.getItem("ot_tracker_settings");
      if (savedEntries) setEntries(JSON.parse(savedEntries));
      if (savedSettings) setSettings(JSON.parse(savedSettings));
      setAuthLoading(false);
      setDataLoading(false);
      return;
    }

    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Listener (Firebase Sync)
  useEffect(() => {
    if (!isFirebaseValid) {
      // Local mode save loop
      localStorage.setItem("ot_tracker_entries", JSON.stringify(entries));
      localStorage.setItem("ot_tracker_settings", JSON.stringify(settings));
      return;
    }

    if (!user) return;

    const entriesRef = collection(
      db,
      "artifacts",
      appId,
      "users",
      user.uid,
      "entries"
    );
    const settingsRef = doc(
      db,
      "artifacts",
      appId,
      "users",
      user.uid,
      "settings",
      "userConfig"
    );

    const unsubEntries = onSnapshot(
      entriesRef,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setDataLoading(false);
      },
      (err) => {
        console.error("Data error:", err);
        setDataLoading(false);
      }
    );

    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) setSettings((prev) => ({ ...prev, ...snap.data() }));
    });

    return () => {
      unsubEntries();
      unsubSettings();
    };
  }, [user, entries, settings]);

  const fyEntries = useMemo(
    () => entries.filter((e) => e.date >= FY_START && e.date <= FY_END),
    [entries]
  );

  const totals = useMemo(() => {
    let grossOT = 0,
      grossPA = 0,
      totalHrs = 0;
    const rates = settings.rates || { r133: 0, r150: 0, r200: 0 };

    fyEntries.forEach((e) => {
      const h133 = parseFloat(e.hours133) || 0,
        h150 = parseFloat(e.hours150) || 0,
        h200 = parseFloat(e.hours200) || 0;
      totalHrs += h133 + h150 + h200;
      grossOT +=
        h133 * (rates.r133 || 0) +
        h150 * (rates.r150 || 0) +
        h200 * (rates.r200 || 0);
      grossPA += PA_RATES[e.paRate] || 0;
    });

    const totalGross = grossOT + grossPA;
    const totalNet = totalGross * (1 - (settings.taxRate || 40) / 100);

    const todayStr = new Date().toISOString().split("T")[0];
    const currentIndex = PAY_PERIODS.findIndex(
      (p) => todayStr >= p.start && todayStr <= p.end
    );

    const getPeriodStats = (idx) => {
      if (idx < 0 || idx >= PAY_PERIODS.length) return null;
      const p = PAY_PERIODS[idx];
      const pEntries = fyEntries.filter(
        (e) => e.date >= p.start && e.date <= p.end
      );
      let gross = 0;
      pEntries.forEach((e) => {
        const h133 = parseFloat(e.hours133) || 0,
          h150 = parseFloat(e.hours150) || 0,
          h200 = parseFloat(e.hours200) || 0;
        gross +=
          h133 * (rates.r133 || 0) +
          h150 * (rates.r150 || 0) +
          h200 * (rates.r200 || 0) +
          (PA_RATES[e.paRate] || 0);
      });
      return {
        month: p.month,
        gross,
        net: gross * (1 - (settings.taxRate || 40) / 100),
      };
    };

    return {
      grossOT,
      grossPA,
      totalGross,
      totalNet,
      totalHrs,
      prevMonth: getPeriodStats(currentIndex - 1),
      currMonth: getPeriodStats(currentIndex),
      nextMonth: getPeriodStats(currentIndex + 1),
    };
  }, [fyEntries, settings]);

  const handleSaveEntry = async () => {
    if (!formData.date) return;
    const hasHours =
      parseFloat(formData.hours133) > 0 ||
      parseFloat(formData.hours150) > 0 ||
      parseFloat(formData.hours200) > 0;
    const hasPA = formData.paRate && formData.paRate !== "None";
    const hasNotes = formData.comments && formData.comments.trim() !== "";

    if (!hasHours && !hasPA && !hasNotes && formData.reason.trim() === "")
      return;

    if (!isFirebaseValid || !user) {
      if (editingEntry) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === editingEntry.id ? { ...formData, id: e.id } : e
          )
        );
        setActiveTab("months");
      } else {
        setEntries((prev) => [
          ...prev,
          { ...formData, id: Date.now().toString() },
        ]);
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 3000);
        mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
      setFormData({
        date: getDefaultDate(),
        reason: "",
        hours133: "",
        hours150: "",
        hours200: "",
        paRate: "None",
        comments: "",
      });
      setEditingEntry(null);
      return;
    }

    const entriesRef = collection(
      db,
      "artifacts",
      appId,
      "users",
      user.uid,
      "entries"
    );
    try {
      if (editingEntry) {
        await updateDoc(doc(entriesRef, editingEntry.id), formData);
        setActiveTab("months");
      } else {
        await addDoc(entriesRef, formData);
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 3000);
        mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
      setFormData({
        date: getDefaultDate(),
        reason: "",
        hours133: "",
        hours150: "",
        hours200: "",
        paRate: "None",
        comments: "",
      });
      setEditingEntry(null);
    } catch (err) {
      console.error(err);
    }
  };

  const editEntry = (e) => {
    setFormData({ ...e });
    setEditingEntry(e);
    setActiveTab("add");
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteEntry = async (id) => {
    if (!isFirebaseValid || !user) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      return;
    }
    try {
      await deleteDoc(
        doc(db, "artifacts", appId, "users", user.uid, "entries", id)
      );
    } catch (err) {
      console.error(err);
    }
  };

  const cancelEdit = () => {
    setFormData({
      date: getDefaultDate(),
      reason: "",
      hours133: "",
      hours150: "",
      hours200: "",
      paRate: "None",
      comments: "",
    });
    setEditingEntry(null);
    setActiveTab("months");
  };

  const handleRankChange = (rank, service) => {
    let newS = {
      ...settings,
      rank,
      service: "",
      rates: { r133: 0, r150: 0, r200: 0 },
    };
    if (rank) {
      const validService = PAY_RATES[rank][service]
        ? service
        : Object.keys(PAY_RATES[rank])[0];
      newS = {
        ...settings,
        rank,
        service: validService,
        rates: PAY_RATES[rank][validService],
      };
    }
    setSettings(newS);

    if (isFirebaseValid && user) {
      setDoc(
        doc(
          db,
          "artifacts",
          appId,
          "users",
          user.uid,
          "settings",
          "userConfig"
        ),
        newS
      ).catch(console.error);
    }
  };

  const updateTax = (taxRate) => {
    const newS = { ...settings, taxRate };
    setSettings(newS);
    if (isFirebaseValid && user) {
      setDoc(
        doc(
          db,
          "artifacts",
          appId,
          "users",
          user.uid,
          "settings",
          "userConfig"
        ),
        newS
      ).catch(console.error);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 text-blue-900">
        <Loader2 className="animate-spin w-10 h-10 mb-4" />
        <p className="font-bold">Booting Tracker...</p>
      </div>
    );
  }

  const renderDashboard = () => (
    <div className="p-4 space-y-6 pb-24 animate-in fade-in zoom-in-95 duration-200">
      {!isFirebaseValid && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm">
          <p className="text-blue-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600" /> Running in Local
            Offline Mode
          </p>
        </div>
      )}
      {!settings.rank && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4 shadow-sm animate-pulse">
          <UserPlus className="w-6 h-6 text-amber-700 shrink-0" />
          <div>
            <h3 className="font-bold text-amber-900 text-sm">
              Action Required
            </h3>
            <p className="text-amber-800 text-xs mt-1">
              Set your Rank in Settings to calculate pay.
            </p>
            <button
              onClick={() => setActiveTab("settings")}
              className="mt-2 text-xs font-bold text-amber-900 flex items-center gap-1 bg-amber-200/50 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors"
            >
              Go to Settings <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      <div className="bg-gradient-to-br from-blue-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
        <h2 className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mb-1">
          Total Gross Pay 26/27
        </h2>
        <div className="text-4xl font-black mb-6">
          £{totals.totalGross.toFixed(2)}
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="text-blue-300 text-[10px] uppercase font-bold">
              Est. Net Pay
            </p>
            <p className="text-xl font-bold text-emerald-400">
              £{totals.totalNet.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-blue-300 text-[10px] uppercase font-bold">
              Total Hours
            </p>
            <p className="text-xl font-bold flex items-center">
              <Clock className="w-4 h-4 mr-1 opacity-70" />
              {totals.totalHrs.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-black text-gray-800 px-1 text-sm uppercase tracking-wider flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" /> Pay Month Summary
        </h3>
        {[
          { stats: totals.prevMonth, label: "Previous Pay Month" },
          {
            stats: totals.currMonth,
            label: "Current Pay Month",
            highlight: true,
          },
          { stats: totals.nextMonth, label: "Next Pay Month" },
        ].map(
          (item, idx) =>
            item.stats && (
              <div
                key={idx}
                className={`${
                  item.highlight
                    ? "bg-blue-50 border-blue-200 ring-1 ring-blue-100"
                    : "bg-white border-gray-100"
                } rounded-xl p-4 shadow-sm border flex justify-between items-center`}
              >
                <div>
                  <p
                    className={`text-[9px] font-black uppercase tracking-widest ${
                      item.highlight ? "text-blue-600" : "text-gray-400"
                    }`}
                  >
                    {item.label}
                  </p>
                  <h4 className="font-bold text-gray-800">
                    {item.stats.month}
                  </h4>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-blue-900 leading-none mb-0.5">
                    £{item.stats.gross.toFixed(2)}{" "}
                    <span className="text-[9px] font-normal text-gray-400 uppercase">
                      Gross
                    </span>
                  </p>
                  <p className="text-xs font-black text-emerald-600 leading-none">
                    £{item.stats.net.toFixed(2)}{" "}
                    <span className="text-[9px] font-normal text-gray-400 uppercase">
                      Net
                    </span>
                  </p>
                </div>
              </div>
            )
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" /> Quick Stats
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
            <span className="text-gray-500">Current Role</span>
            <span className="font-bold text-gray-800">
              {settings.service || "Not Selected"}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
            <span className="text-gray-500">1.33x Rate</span>
            <span className="font-bold text-gray-800">
              £{(settings.rates?.r133 || 0).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
            <span className="text-gray-500">1.50x Rate</span>
            <span className="font-bold text-gray-800">
              £{(settings.rates?.r150 || 0).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
            <span className="text-gray-500">2.0x Rate</span>
            <span className="font-bold text-gray-800">
              £{(settings.rates?.r200 || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBreakdown = () => (
    <div className="p-4 space-y-4 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <h2 className="text-xl font-black text-gray-800 px-1 mb-2">
        Pay Breakdown
      </h2>
      {PAY_PERIODS.map((p) => {
        const pEntries = fyEntries.filter(
          (e) => e.date >= p.start && e.date <= p.end
        );
        let h133 = 0,
          h150 = 0,
          h200 = 0,
          pa1 = 0,
          pa2 = 0,
          pa3 = 0,
          gOT = 0,
          gPA = 0;
        const rates = settings.rates || { r133: 0, r150: 0, r200: 0 };

        pEntries.forEach((e) => {
          const hours = {
            r133: parseFloat(e.hours133) || 0,
            r150: parseFloat(e.hours150) || 0,
            r200: parseFloat(e.hours200) || 0,
          };
          h133 += hours.r133;
          h150 += hours.r150;
          h200 += hours.r200;
          gOT +=
            hours.r133 * (rates.r133 || 0) +
            hours.r150 * (rates.r150 || 0) +
            hours.r200 * (rates.r200 || 0);
          gPA += PA_RATES[e.paRate] || 0;
          if (e.paRate === "PA1") pa1++;
          else if (e.paRate === "PA2") pa2++;
          else if (e.paRate === "PA3") pa3++;
        });

        const tax = (settings.taxRate || 40) / 100,
          nOT = gOT * (1 - tax),
          nPA = gPA * (1 - tax),
          totalG = gOT + gPA,
          totalN = nOT + nPA;
        const isExp = expandedMonth === p.month;
        return (
          <div
            key={p.month}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <button
              onClick={() => setExpandedMonth(isExp ? null : p.month)}
              className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{p.month}</h3>
                  <div className="flex items-center gap-1.5 text-[9px] text-blue-600 font-black uppercase tracking-widest mt-0.5">
                    <Calendar className="w-3 h-3" />{" "}
                    {new Date(p.start).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    -{" "}
                    {new Date(p.end).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 px-2 py-1 rounded-lg text-blue-700 font-black text-xs">
                  {(h133 + h150 + h200).toFixed(1)} hrs{" "}
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      isExp ? "rotate-90" : ""
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-blue-50/50 p-2 rounded-lg border border-blue-100/50 space-y-0.5">
                  <p className="text-[9px] font-black text-blue-800 uppercase mb-1">
                    Overtime Pay
                  </p>
                  <p className="text-[11px] font-bold text-blue-900 flex justify-between">
                    <span>Gross:</span> <span>£{gOT.toFixed(2)}</span>
                  </p>
                  <p className="text-[11px] font-bold text-blue-700 flex justify-between">
                    <span>Net:</span> <span>£{nOT.toFixed(2)}</span>
                  </p>
                </div>
                <div className="bg-amber-50/50 p-2 rounded-lg border border-amber-100/50 space-y-1">
                  <p className="text-[9px] font-black text-amber-800 uppercase mb-1">
                    PA Allowance
                  </p>
                  <div className="space-y-0.5 mb-1 text-[9px] font-bold text-amber-900/70 uppercase">
                    {pa1 > 0 && <span>PA1: {pa1} • </span>}
                    {pa2 > 0 && <span>PA2: {pa2} • </span>}
                    {pa3 > 0 && <span>PA3: {pa3}</span>}
                    {pa1 === 0 && pa2 === 0 && pa3 === 0 && (
                      <span>None submitted</span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-amber-900 flex justify-between">
                    <span>Gross:</span> <span>£{gPA.toFixed(2)}</span>
                  </p>
                  <p className="text-[11px] font-bold text-amber-700 flex justify-between">
                    <span>Net:</span> <span>£{nPA.toFixed(2)}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                    Total Monthly (G)
                  </p>
                  <p className="font-black text-blue-950 text-lg leading-none">
                    £{totalG.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">
                    Total Monthly (N)
                  </p>
                  <p className="font-black text-emerald-600 text-lg leading-none">
                    £{totalN.toFixed(2)}
                  </p>
                </div>
              </div>
            </button>
            {isExp && (
              <div className="bg-slate-50 p-3 space-y-3 border-t border-gray-100">
                {pEntries.length === 0 ? (
                  <p className="text-center text-[10px] py-4 text-gray-400 font-bold uppercase tracking-widest">
                    No entries found.
                  </p>
                ) : (
                  [...pEntries]
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .map((e) => {
                      const eOT =
                        (parseFloat(e.hours133) || 0) * (rates.r133 || 0) +
                        (parseFloat(e.hours150) || 0) * (rates.r150 || 0) +
                        (parseFloat(e.hours200) || 0) * (rates.r200 || 0);
                      const ePA = PA_RATES[e.paRate] || 0,
                        eG = eOT + ePA,
                        eN = eG * (1 - tax);
                      return (
                        <div
                          key={e.id}
                          className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm space-y-3 group"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-black text-gray-800">
                                {new Date(e.date).toLocaleDateString("en-GB")}
                              </p>
                              <p className="text-xs text-gray-500 font-medium">
                                {e.reason || "Duty Record"}
                              </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => editEntry(e)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(e.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5 border border-slate-100 text-[11px]">
                            {eOT > 0 && (
                              <div className="flex justify-between">
                                <span>Overtime Breakdown</span>
                                <span className="font-bold">
                                  £{eOT.toFixed(2)}
                                </span>
                              </div>
                            )}
                            {ePA > 0 && (
                              <div className="flex justify-between text-amber-700">
                                <span>{e.paRate} Allowance</span>
                                <span className="font-bold">
                                  £{ePA.toFixed(2)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between pt-1 border-t border-slate-200 font-black text-blue-900">
                              <span>Entry Total (Gross)</span>
                              <span>£{eG.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-black text-emerald-600">
                              <span>Entry Total (Net)</span>
                              <span>£{eN.toFixed(2)}</span>
                            </div>
                          </div>
                          {e.comments && (
                            <p className="text-[10px] italic text-gray-500 px-2 border-l-2 border-blue-200 py-0.5">
                              "{e.comments}"
                            </p>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderAddEntry = () => (
    <div className="p-4 pb-24 animate-in slide-in-from-right-4 duration-200">
      <h2 className="text-xl font-black text-gray-800 px-1 mb-6 flex items-center gap-2">
        {editingEntry ? (
          <>
            <ArrowLeft
              onClick={cancelEdit}
              className="w-6 h-6 cursor-pointer text-blue-600"
            />{" "}
            Edit Entry
          </>
        ) : (
          "OT & PA Entry"
        )}
      </h2>
      {showSaveSuccess && (
        <div className="mb-4 bg-emerald-50 text-emerald-800 p-4 rounded-xl flex items-center gap-3 border border-emerald-100 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <p className="font-bold text-sm">Entry Saved Successfully</p>
        </div>
      )}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-5">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            Date
          </label>
          <input
            type="date"
            min={FY_START}
            max={FY_END}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            Reason / Duty
          </label>
          <input
            type="text"
            placeholder="MPL7XX, PurpleXX"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={formData.reason}
            onChange={(e) =>
              setFormData({ ...formData, reason: e.target.value })
            }
          />
        </div>
        <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
          <label className="block text-[10px] font-black text-blue-900 uppercase tracking-widest">
            Hours Worked
          </label>
          <div className="grid grid-cols-3 gap-3">
            {["hours133", "hours150", "hours200"].map((h, i) => (
              <div key={h} className="text-center">
                <label className="block text-[9px] font-black text-blue-700 mb-1">
                  {[1.33, 1.5, 2.0][i]}x
                </label>
                <input
                  type="number"
                  step="0.25"
                  placeholder="0"
                  className="w-full border rounded-lg p-2 text-center text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData[h]}
                  onChange={(e) =>
                    setFormData({ ...formData, [h]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100 space-y-3">
          <label className="block text-[10px] font-black text-amber-900 uppercase tracking-widest">
            Allowance (P/A)
          </label>
          <select
            className="w-full bg-white border border-amber-200 rounded-lg p-3 font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={formData.paRate}
            onChange={(e) =>
              setFormData({ ...formData, paRate: e.target.value })
            }
          >
            <option value="None">None</option>
            <option value="PA1">PA1 (£40)</option>
            <option value="PA2">PA2 (£90)</option>
            <option value="PA3">PA3 (£125)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            Notes
          </label>
          <textarea
            rows="3"
            placeholder="Additional details..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            value={formData.comments}
            onChange={(e) =>
              setFormData({ ...formData, comments: e.target.value })
            }
          />
        </div>
        <button
          onClick={handleSaveEntry}
          className="w-full bg-blue-600 text-white font-black rounded-xl p-4 shadow-lg shadow-blue-600/20 active:scale-95 transition-transform flex justify-center items-center gap-2"
        >
          <Save className="w-5 h-5" />{" "}
          {editingEntry ? "Update Entry" : "Save Entry"}
        </button>
      </div>
    </div>
  );

  const renderGraph = () => {
    const data = PAY_PERIODS.map((p) => {
      const pEntries = fyEntries.filter(
        (e) => e.date >= p.start && e.date <= p.end
      );
      const rates = settings.rates || { r133: 0, r150: 0, r200: 0 };
      let gOT = 0;
      pEntries.forEach((e) => {
        gOT +=
          (parseFloat(e.hours133) || 0) * (rates.r133 || 0) +
          (parseFloat(e.hours150) || 0) * (rates.r150 || 0) +
          (parseFloat(e.hours200) || 0) * (rates.r200 || 0);
      });
      return {
        short: p.short,
        gOT,
        nOT: gOT * (1 - (settings.taxRate || 40) / 100),
      };
    });
    const maxVal = Math.max(...data.map((d) => d.gOT), 100);
    return (
      <div className="p-4 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <h2 className="text-xl font-black text-gray-800 px-1 mb-2">
          Earnings Graph
        </h2>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest px-1 mb-6">
          Overtime Only (Gross vs Net)
        </p>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex h-64 border-b border-slate-100 pb-2 relative">
            <div className="flex flex-col justify-between items-end pr-3 text-[9px] font-bold text-slate-400 w-12 shrink-0">
              <span>£{Math.round(maxVal)}</span>
              <span>£{Math.round(maxVal / 2)}</span>
              <span>£0</span>
            </div>
            <div className="flex-1 flex items-end justify-between gap-1 px-1 h-full pt-4">
              {data.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center group relative h-full"
                >
                  <div className="w-full flex items-end justify-center gap-[1px] h-full">
                    <div
                      className="w-1/2 bg-blue-600 rounded-t shadow-sm transition-all duration-700"
                      style={{ height: `${(d.gOT / maxVal) * 100}%` }}
                    ></div>
                    <div
                      className="w-1/2 bg-emerald-500 rounded-t shadow-sm transition-all duration-700"
                      style={{ height: `${(d.nOT / maxVal) * 100}%` }}
                    ></div>
                  </div>
                  <div className="absolute -top-10 bg-slate-900 text-white text-[8px] p-2 rounded hidden group-hover:block z-10 whitespace-nowrap shadow-xl">
                    <p>Gross: £{d.gOT.toFixed(0)}</p>
                    <p className="text-emerald-400 font-bold">
                      Net: £{d.nOT.toFixed(0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex ml-12 mt-2 text-[8px] font-black text-slate-400">
            {data.map((d, i) => (
              <div key={i} className="flex-1 text-center truncate">
                {d.short}
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-600 rounded-sm"></div>
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                Gross OT
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                Net OT
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="p-4 pb-24 animate-in fade-in slide-in-from-left-4 duration-200">
      <h2 className="text-xl font-black text-gray-800 px-1 mb-6">Settings</h2>
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-6">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Rank & Era
          </label>
          <select
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={settings.rank}
            onChange={(e) => handleRankChange(e.target.value, settings.service)}
          >
            <option value="">Select Rank...</option>
            {Object.keys(PAY_RATES).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        {settings.rank && (
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
              Length of Service
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={settings.service}
              onChange={(e) => handleRankChange(settings.rank, e.target.value)}
            >
              {Object.keys(PAY_RATES[settings.rank]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="border-t border-slate-50 pt-6">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
            Tax Band (%)
          </label>
          <div className="flex gap-2 p-1 bg-slate-50 rounded-xl border border-slate-200">
            {[20, 40, 45].map((rateVal) => (
              <button
                key={rateVal}
                onClick={() => updateTax(rateVal)}
                className={`flex-1 py-3 rounded-lg text-sm font-black transition-all ${
                  settings.taxRate === rateVal
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "text-slate-400 hover:bg-slate-200"
                }`}
              >
                {rateVal}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-gray-900 font-sans max-w-md mx-auto relative shadow-2xl border-x border-gray-200 overflow-hidden">
      <header className="bg-white px-5 py-5 border-b border-gray-100 flex items-center justify-center shrink-0 z-10">
        <h1 className="text-lg font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-950 to-blue-600 flex items-center gap-2 tracking-tight">
          <PoundSterling className="w-5 h-5 text-blue-700" /> Overtime Tracker
        </h1>
      </header>
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto w-full scroll-smooth"
      >
        {activeTab === "dashboard" && renderDashboard()}
        {activeTab === "add" && renderAddEntry()}
        {activeTab === "months" && renderBreakdown()}
        {activeTab === "graph" && renderGraph()}
        {activeTab === "settings" && renderSettings()}
      </main>
      <nav className="bg-white border-t border-gray-100 absolute bottom-0 w-full px-2 h-18 pb-safe shrink-0 z-20 shadow-[0_-8px_25px_-5px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between items-center h-16">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex-1 flex flex-col items-center gap-1 transition-colors ${
              activeTab === "dashboard" ? "text-blue-600" : "text-slate-400"
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest leading-none">
              Overview
            </span>
          </button>
          <button
            onClick={() => setActiveTab("add")}
            className={`flex-1 flex flex-col items-center gap-1 transition-colors ${
              activeTab === "add" ? "text-blue-600" : "text-slate-400"
            }`}
          >
            <PlusCircle className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest leading-none text-center">
              OT/PA Entry
            </span>
          </button>
          <button
            onClick={() => setActiveTab("months")}
            className={`flex-1 flex flex-col items-center gap-1 transition-colors ${
              activeTab === "months" ? "text-blue-600" : "text-slate-400"
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest leading-none text-center">
              Breakdown
            </span>
          </button>
          <button
            onClick={() => setActiveTab("graph")}
            className={`flex-1 flex flex-col items-center gap-1 transition-colors ${
              activeTab === "graph" ? "text-blue-600" : "text-slate-400"
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest leading-none text-center">
              Graph
            </span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex-1 flex flex-col items-center gap-1 transition-colors ${
              activeTab === "settings" ? "text-blue-600" : "text-slate-400"
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest leading-none text-center">
              Settings
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
