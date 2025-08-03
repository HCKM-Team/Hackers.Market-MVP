"use client";
import { Address } from "viem";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useDeployEscrow } from "@/lib/web3/hooks/useDeployEscrow";
import { uploadToIPFS } from "@/lib/web3/utils/ipfs";
import { calculateOptimalChain } from "@/lib/web3/utils/chain";
import { parseEther } from "viem";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/router";

interface EscrowFormData {
  title: string;
  description: string;
  price: string;
  currency: Address;
  category: string;
  deliveryTime: number;
  requiredKYC: KYCLevel;
  images: File[];
}

const escrowSteps = [
  "Basic Information",
  "Pricing & Currency",
  "Security Settings",
  "Review & Deploy",
];

export function CreateEscrowWizard() {
  const [step, setStep] = useState(0);
  const { control, handleSubmit, watch } = useForm<EscrowFormData>();
  const { deployEscrow, isLoading } = useDeployEscrow();
  const router = useRouter();

  const onSubmit = async (data: EscrowFormData) => {
    // Upload images to IPFS
    const imageHashes = await uploadToIPFS(data.images);

    // Calculate optimal chain for deployment
    const optimalChain = await calculateOptimalChain({
      value: parseEther(data.price),
      currency: data.currency,
    });

    // Deploy escrow contract
    const tx = await deployEscrow({
      ...data,
      imageHashes,
      chainId: optimalChain.id,
    });

    // Navigate to escrow management
    router.push(`/escrow/${tx.contractAddress}`);
  };

  return (
    <WizardContainer>
      <ProgressIndicator steps={escrowSteps} current={step} />

      <AnimatePresence mode="wait">
        <motion.div key={step}>
          {step === 0 && <BasicInfoStep control={control} />}
          {step === 1 && <PricingStep control={control} />}
          {step === 2 && <SecurityStep control={control} />}
          {step === 3 && <ReviewStep data={watch()} />}
        </motion.div>
      </AnimatePresence>

      <WizardNavigation
        onNext={() => setStep((s) => s + 1)}
        onPrev={() => setStep((s) => s - 1)}
        onSubmit={handleSubmit(onSubmit)}
        isLastStep={step === escrowSteps.length - 1}
        isLoading={isLoading}
      />
    </WizardContainer>
  );
}
