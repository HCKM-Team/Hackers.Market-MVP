import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { useEmergencyStop } from "@/lib/web3/hooks/useEmergencyStop";
import { Address } from "viem";
import { getAuthenticationOptions } from "@/lib/web3/utils/auth";
import { hashPanicCode } from "@/lib/web3/utils/hash";
import { sendEmergencyNotifications } from "@/lib/web3/utils/notifications";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function EmergencyStop({ escrowId }: { escrowId: Address }) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { activateEmergency } = useEmergencyStop();
  const [panicCode, setPanicCode] = useState("");

  const handleEmergencyActivation = async () => {
    // Biometric authentication if available
    if ("credentials" in navigator) {
      const credential = await navigator.credentials.get({
        publicKey: getAuthenticationOptions(),
      });

      if (!credential) return;
    }

    // Activate emergency with panic code
    await activateEmergency({
      escrowId,
      panicCode: hashPanicCode(panicCode),
    });

    // Send notifications
    await sendEmergencyNotifications();
  };

  return (
    <>
      <motion.button
        className="emergency-button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowConfirmation(true)}
      >
        <AlertCircle className="w-6 h-6" />
        EMERGENCY STOP
      </motion.button>

      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Activate Emergency Stop?</DialogTitle>
            <DialogDescription>
              This will immediately lock all funds and notify security team.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Enter panic code"
              value={panicCode}
              onChange={(e) => setPanicCode(e.target.value)}
            />

            <div className="flex gap-3">
              <Button
                variant="destructive"
                onClick={handleEmergencyActivation}
                className="flex-1"
              >
                Activate Emergency Stop
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowConfirmation(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
