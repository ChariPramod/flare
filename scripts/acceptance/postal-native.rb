# frozen_string_literal: true

# Run only inside the disposable, pinned Postal 3.3.7 container via Rails runner.
# Real Postal MessageDB, HTTPSender, WebhookDeliveryService and HTTP are used;
# message content and the delivery outcome are synthetic, with no SMTP dispatch.
require "json"
require "securerandom"

raise "Disposable acceptance only" unless ENV["FLARE_ACCEPTANCE"] == "true"
raise "Unexpected Postal version" unless Postal.version.to_s == "3.3.7"

fixture = JSON.parse(File.read("/acceptance/postal-native.json"))
raise "Invalid fixture domain" unless fixture.fetch("domainId").match?(/\A[0-9a-f-]{36}\z/)
origin = "http://flare-api:4000"
inbound_url = "#{origin}/v1/inbound/postal/#{fixture.fetch('domainId')}"
event_url = "#{origin}/v1/events/postal"
blocked = Postal::HTTP.post("http://127.0.0.1:4000/v1/events/postal", json: "{}", sign: true, timeout: 5)
raise "Postal private-address guard is disabled" unless blocked[:code] == -4

user = User.create!(first_name: "Flare", last_name: "Acceptance",
                    email_address: "native-#{SecureRandom.hex(8)}@acceptance.test",
                    password: SecureRandom.hex(32))
organization = Organization.create!(name: "Flare native acceptance", owner: user)
server = organization.servers.create!(name: "Native callbacks", mode: "Development")
endpoint = server.http_endpoints.create!(name: "Flare inbound", url: inbound_url,
                                        encoding: "BodyAsJSON", format: "RawMessage")
incoming = server.message_db.new_message("scope" => "incoming",
                                         "mail_from" => "incoming@example.net",
                                         "rcpt_to" => fixture.fetch("inboundRecipient"))
incoming.raw_message = fixture.fetch("raw")
incoming.save(queue_on_create: false)
sender = HTTPSender.new(endpoint)
2.times do
  result = sender.send_message(incoming)
  raise "Native RawMessage failed: #{result.details}" unless result.type == "Sent"
end

# Verify missing/wrong signatures through the same native HTTP/address guard.
body = sender.send(:parameters, incoming, flat: false).to_json
raise "Expected native wrapped base64" unless JSON.parse(body).fetch("message").include?("\n")
unsigned = Postal::HTTP.post(inbound_url, json: body, timeout: 5)
raise "Unsigned callback was accepted" unless unsigned[:code] == 401
tampered = Postal::HTTP.post(inbound_url, json: body + " ", timeout: 5,
                             headers: { "X-Postal-Signature-256" => Postal.signer.sign64(body) })
raise "Tampered callback was accepted" unless tampered[:code] == 401
conflict = JSON.parse(body)
conflict["mail_from"] = "different@example.net"
conflicting = Postal::HTTP.post(inbound_url, json: conflict.to_json, sign: true, timeout: 5)
raise "Conflicting native ID was accepted" unless conflicting[:code] == 409

outgoing = server.message_db.new_message("scope" => "outgoing",
                                         "mail_from" => "sender@acceptance.test",
                                         "rcpt_to" => fixture.fetch("recipient"))
outgoing.raw_message = "From: sender@acceptance.test\r\nTo: #{fixture.fetch('recipient')}\r\nMessage-ID: <#{fixture.fetch('messageId')}@acceptance.test>\r\nSubject: Native callback fixture\r\n\r\nSynthetic delivery outcome.\r\n"
outgoing.save(queue_on_create: false)
delivery = Postal::MessageDB::Delivery.new(outgoing, "status" => "Sent",
                                          "details" => "Synthetic local acceptance result",
                                          "output" => "250 fixture", "sent_with_ssl" => false,
                                          "timestamp" => Time.now.to_f, "time" => 0.01)
2.times do
  # Lock before creation so the real background worker cannot race this direct,
  # deterministic service invocation. The native service records and removes it.
  request = server.webhook_requests.create!(event: delivery.webhook_event,
                                            payload: delivery.webhook_hash,
                                            url: event_url, uuid: fixture.fetch("eventId"),
                                            locked_by: "flare-acceptance", locked_at: Time.current)
  service = WebhookDeliveryService.new(webhook_request: request)
  service.call
  raise "Native delivery webhook failed" unless service.success?
  raise "Native webhook request not acknowledged" if WebhookRequest.exists?(request.id)
end
raise "Unexpected SMTP queue submission" if server.queued_messages.exists?
puts "Postal 3.3.7 native serializer, SHA-256 signer, allowed HTTP callbacks, deduplication and rejection probes passed. No SMTP dispatch."
