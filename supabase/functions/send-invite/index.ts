import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, token, exam_link, role, expiry } = await req.json()

    const serviceId = Deno.env.get("EMAILJS_SERVICE_ID")?.trim()
    const templateId = Deno.env.get("EMAILJS_TEMPLATE_ID")?.trim()
    const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY")?.trim()
    const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY")?.trim()

    console.log(`[Bridge] Service: ${serviceId?.substring(0, 5)}..., Template: ${templateId}, Public: ${publicKey?.substring(0, 5)}..., Private Length: ${privateKey?.length}`)

    if (!privateKey) {
      throw new Error("EMAILJS_PRIVATE_KEY is missing from Supabase secrets!")
    }

    // Call EmailJS API (Triple-Check Mode)
    const url = `https://api.emailjs.com/api/v1.0/email/send?accessToken=${privateKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${privateKey}` 
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey,
        template_params: {
          to_email: email,
          candidate_name: email.split('@')[0],
          token: token,
          exam_link: exam_link,
          role: role,
          expiry: expiry
        }
      })
    })

    const result = await response.text()
    if (!response.ok) throw new Error(result)

    return new Response(JSON.stringify({ message: "Email sent via EmailJS bridge" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
