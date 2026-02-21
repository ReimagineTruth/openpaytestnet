import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LegalPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-10">
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="paypal-surface flex h-10 w-10 items-center justify-center rounded-full"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-paypal-dark">Legal</h1>
      </div>

      <div className="paypal-surface rounded-3xl p-5 space-y-4 text-sm text-foreground">
        <p>
          OpenPay is free to use with no platform fee at this time for supported in-app usage.
        </p>
        <p className="font-semibold">Software License</p>
        <p>Copyright (C) 2025 MRWAIN ORGANIZATION</p>
        <p>
          Permission is hereby granted by the application software developer (&quot;Software Developer&quot;), free of charge,
          to any person obtaining a copy of this application, software and associated documentation files
          (the &quot;Software&quot;), which was developed by the Software Developer for use on Pi Network, whereby the purpose of
          this license is to permit the development of derivative works based on the Software, including the right to use,
          copy, modify, merge, publish, distribute, sub-license, and/or sell copies of such derivative works and any
          Software components incorporated therein, and to permit persons to whom such derivative works are furnished to do so,
          in each case, solely to develop, use and market applications for the official Pi Network.
        </p>
        <p>
          For purposes of this license, Pi Network shall mean any application, software, or other present or future platform
          developed, owned or managed by Pi Community Company, and its parents, affiliates or subsidiaries, for which the
          Software was developed, or on which the Software continues to operate. However, you are prohibited from using any
          portion of the Software or any derivative works thereof in any manner (a) which infringes on any Pi Network
          intellectual property rights, (b) to hack any of Pi Network&apos;s systems or processes or (c) to develop any product
          or service which is competitive with the Pi Network.
        </p>
        <p>
          The above copyright notice and this permission notice shall be included in all copies or substantial portions of
          the Software.
        </p>
        <p>
          THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
          THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
          AUTHORS, PUBLISHERS, OR COPYRIGHT HOLDERS OF THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
          EXEMPLARY OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO BUSINESS INTERRUPTION, LOSS OF USE, DATA OR PROFITS)
          HOWEVER CAUSED AND UNDER ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE)
          ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
        </p>
        <p>Pi, Pi Network and the Pi logo are trademarks of the Pi Community Company.</p>
        <p>Copyright (C) 2025 MRWAIN ORGANIZATION</p>
      </div>
    </div>
  );
};

export default LegalPage;

