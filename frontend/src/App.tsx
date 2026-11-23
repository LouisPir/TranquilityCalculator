import Header from './components/Header';
import ReportPrint from './components/ReportPrint';
import Stepper from './components/Stepper';
import StepAudit from './pages/StepAudit';
import StepPlan from './pages/StepPlan';
import StepDossier from './pages/StepDossier';
import StepScore from './pages/StepScore';
import { AuditProvider, useAudit } from './state/AuditContext';

function Ecran() {
  const { state } = useAudit();
  // Sans résultat d'audit, seule l'étape 1 est utilisable.
  const step = state.auditLance ? state.step : 1;
  return (
    <>
      <Header />
      <Stepper />
      <main className="page no-print">
        {step === 1 && <StepDossier />}
        {step === 2 && <StepAudit />}
        {step === 3 && <StepScore />}
        {step === 4 && <StepPlan />}
      </main>
      <ReportPrint />
    </>
  );
}

export default function App() {
  return (
    <AuditProvider>
      <Ecran />
    </AuditProvider>
  );
}
