'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { getSafeRedirectPath } from '@kit/shared/safe-redirect';
import { useSignInWithOtp } from '@kit/supabase/hooks/use-sign-in-with-otp';
import { useVerifyOtp } from '@kit/supabase/hooks/use-verify-otp';
import { Button } from '@kit/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from '@kit/ui/form';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@kit/ui/input-otp';
import { Spinner } from '@kit/ui/spinner';
import { Trans } from '@kit/ui/trans';

import { useCaptcha } from '../captcha/client';
import { useRecordAuthMethod } from '../hooks/use-last-auth-method';
import { AuthErrorAlert } from './auth-error-alert';
import { EmailInput } from './email-input';
import { LastAuthMethodHint } from './last-auth-method-hint';

const EmailSchema = z.object({ email: z.string().email() });
const OtpSchema = z.object({ token: z.string().min(6).max(6) });

type OtpSignInContainerProps = {
  shouldCreateUser: boolean;
  captchaSiteKey?: string;
};

export function OtpSignInContainer(props: OtpSignInContainerProps) {
  const verifyMutation = useVerifyOtp();
  const router = useRouter();
  const recordAuthMethod = useRecordAuthMethod();
  const params = useSearchParams();

  const otpForm = useForm({
    resolver: zodResolver(OtpSchema.merge(EmailSchema)),
    defaultValues: {
      token: '',
      email: '',
    },
  });

  const email = useWatch({
    control: otpForm.control,
    name: 'email',
  });

  const isEmailStep = !email;

  const shouldCreateUser =
    'shouldCreateUser' in props && props.shouldCreateUser;

  const handleVerifyOtp = async ({
    token,
    email,
  }: {
    token: string;
    email: string;
  }) => {
    await verifyMutation.mutateAsync({
      type: 'email',
      email,
      token,
    });

    // Record successful OTP sign-in
    recordAuthMethod('otp', { email });

    // on sign ups we redirect to the app home
    const next = getSafeRedirectPath(params.get('next'), '/home');

    router.replace(next);
  };

  if (isEmailStep) {
    return (
      <OtpEmailForm
        shouldCreateUser={shouldCreateUser}
        captchaSiteKey={props.captchaSiteKey}
        onSendOtp={(email) => {
          // record on send: the user may complete the sign in by clicking the
          // link in the email, which resolves server-side in /auth/confirm and
          // never runs handleVerifyOtp
          recordAuthMethod('otp', { email });

          otpForm.setValue('email', email, {
            shouldValidate: true,
          });
        }}
      />
    );
  }

  return (
    <Form {...otpForm}>
      <form
        className="flex w-full flex-col items-center gap-y-4"
        onSubmit={otpForm.handleSubmit(handleVerifyOtp)}
      >
        <AuthErrorAlert error={verifyMutation.error} />

        <FormField
          name="token"
          render={({ field }) => (
            <FormItem>
              <FormControl className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  {...field}
                  disabled={verifyMutation.isPending}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} data-slot="0" />
                    <InputOTPSlot index={1} data-slot="1" />
                    <InputOTPSlot index={2} data-slot="2" />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} data-slot="3" />
                    <InputOTPSlot index={4} data-slot="4" />
                    <InputOTPSlot index={5} data-slot="5" />
                  </InputOTPGroup>
                </InputOTP>
              </FormControl>

              <FormDescription>
                <Trans i18nKey="common.otp.enterCodeFromEmail" />
              </FormDescription>

              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex w-full flex-col gap-y-2">
          <Button
            type="submit"
            disabled={verifyMutation.isPending}
            data-test="otp-verify-button"
          >
            {verifyMutation.isPending ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                <Trans i18nKey="common.otp.verifying" />
              </>
            ) : (
              <Trans i18nKey="common.otp.verifyCode" />
            )}
          </Button>

          <Button
            className="relative"
            type="button"
            variant="ghost"
            disabled={verifyMutation.isPending}
            onClick={() => {
              otpForm.setValue('email', '', {
                shouldValidate: true,
              });
            }}
          >
            <Trans i18nKey="common.otp.requestNewCode" />
          </Button>
        </div>
      </form>
    </Form>
  );
}

function OtpEmailForm({
  shouldCreateUser,
  captchaSiteKey,
  onSendOtp,
}: {
  shouldCreateUser: boolean;
  captchaSiteKey?: string;
  onSendOtp: (email: string) => void;
}) {
  const captcha = useCaptcha({ siteKey: captchaSiteKey });
  const signInMutation = useSignInWithOtp();

  const emailForm = useForm({
    resolver: zodResolver(EmailSchema),
    defaultValues: { email: '' },
  });

  const handleSendOtp = async ({ email }: z.output<typeof EmailSchema>) => {
    await signInMutation.mutateAsync({
      email,
      options: { captchaToken: captcha.token, shouldCreateUser },
    });

    captcha.reset();
    onSendOtp(email);
  };

  return (
    <Form {...emailForm}>
      <form
        className="flex flex-col gap-y-2"
        onSubmit={emailForm.handleSubmit(handleSendOtp)}
      >
        <AuthErrorAlert error={signInMutation.error} />

        <FormField
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <EmailInput data-test="otp-email-input" {...field} />
              </FormControl>

              <FormMessage />
            </FormItem>
          )}
        />

        {captcha.field}

        <Button
          type="submit"
          className="relative"
          disabled={signInMutation.isPending}
          data-test="otp-send-button"
        >
          {signInMutation.isPending ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              <Trans i18nKey="common.otp.sendingCode" />
            </>
          ) : (
            <Trans i18nKey="common.otp.sendVerificationCode" />
          )}

          <LastAuthMethodHint
            type="otp"
            className="absolute right-0 translate-x-[50%] translate-y-[-50%]"
          />
        </Button>
      </form>
    </Form>
  );
}
