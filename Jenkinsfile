pipeline {
    agent any
    environment {
        BRANCH = "$env.BRANCH_NAME".replace("-canary", "")
        BUILD_CONF = credentials("bunkan-jenkins-conf")
        JENKINS_CREDENTIALS = credentials("bunkan-jenkins-credentials")
        KUBE_SECRET = credentials("bunkan-kube-secret")
        KUBE_CONFIG = credentials("bunkan-kube-config")
        COMMON_SECRET = credentials("bunkan-common-secret")
        SSH_KEY = credentials("bunkan-id")
        ALL_PROJECTS = "akan"
        ALL_LIBS="shared,util"
        TEST_LIBS="util,shared"
    }
    stages {
        stage("Boot"){
            steps{
                sh "cp $BUILD_CONF .jenkins.conf"
                load ".jenkins.conf"
                discordSend description: "Build Start - $env.JOB_NAME $env.BUILD_NUMBER", link: env.BUILD_URL, result: currentBuild.currentResult, title: env.JOB_NAME, webhookURL: env.DISCORD_WEBHOOK
                sh "tar --exclude=.git -cvf codebase.tar ./"
            }
        }
        stage("Prepare"){
            parallel{
                stage("Prepare Master"){
                    steps{
                        sh "ssh -o StrictHostKeyChecking=no -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"mkdir -p $REPO_NAME/$BRANCH/node_modules && touch $REPO_NAME/$BRANCH/dummy.js\""
                        sh "ssh -i $SSH_KEY -p $MASTER_PORT $MASTER_USER@$MASTER_HOST \"cd $REPO_NAME/$BRANCH && find . -maxdepth 1 ! -path . ! \\( -name node_modules -or -name bun.lock -or -name dist -or -name .git \\) -print0 | xargs -0 rm -r\""
                        sh "scp -i $SSH_KEY -P $MASTER_PORT codebase.tar $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/codebase.tar"
                        sh "ssh -i $SSH_KEY -p $MASTER_PORT $MASTER_USER@$MASTER_HOST \"cd $REPO_NAME/$BRANCH && tar -xvf codebase.tar\""
                        sh "scp -i $SSH_KEY -P $MASTER_PORT $KUBE_SECRET $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/master/regcred.yaml"
                        sh "scp -i $SSH_KEY -P $MASTER_PORT $COMMON_SECRET $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/app/values/_common-secret.yaml"
                        sh "scp -i $SSH_KEY -P $MASTER_PORT $JENKINS_CREDENTIALS $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/master/jenkins/credentials.sh"
                        script {
                            ALL_PROJECTS.tokenize(",").each { app -> 
                                sh "scp -i $SSH_KEY -P $MASTER_PORT $KUBE_CONFIG $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/master/${app}.yaml"
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-helm-secret", variable: "SECRET")]) {
                                    sh "scp -i $SSH_KEY -P $MASTER_PORT $SECRET $MASTER_USER@$MASTER_HOST:~/$REPO_NAME/$BRANCH/infra/app/values/$app-secret.yaml"
                                }
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra/master && chmod 777 ${app}.yaml && kubectl config use-context $app --kubeconfig ${app}.yaml\""
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra/master && kubectl get ns $app-$BRANCH --kubeconfig ${app}.yaml || kubectl create ns $app-$BRANCH --kubeconfig ${app}.yaml\""
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra/master && (kubectl delete -f regcred.yaml -n $app-$BRANCH --kubeconfig ${app}.yaml || true) && kubectl apply -f regcred.yaml -n $app-$BRANCH --kubeconfig ${app}.yaml\""
                            }
                        }
                    }
                }
                stage("Prepare Build"){
                    steps{
                        sh "ssh -i $SSH_KEY -o StrictHostKeyChecking=no $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"mkdir -p $REPO_NAME/$BRANCH/node_modules && mkdir -p $REPO_NAME/$BRANCH/dist && touch $REPO_NAME/$BRANCH/dummy.js && chmod -R 777 $REPO_NAME/$BRANCH/dist \""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && find . -maxdepth 1 ! -path . ! \\( -name node_modules -or -name bun.lock -or -name dist -or -name .git \\) -print0 | xargs -0 rm -r\""
                        sh "scp -i $SSH_KEY -P $BUILD_PORT codebase.tar $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/codebase.tar"
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && tar -xvf codebase.tar\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && echo 'USE_AKANJS_PKGS=true' >> .env\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && echo 'AKAN_PUBLIC_REPO_NAME=$REPO_NAME' >> .env\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && echo 'AKAN_PUBLIC_SERVE_DOMAIN=$env.SERVE_DOMAIN' >> .env\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && echo 'AKAN_PUBLIC_ENV=$BRANCH' >> .env\""
                        sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && timeout 3m bun install\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && bun run buildAkan\""
                        sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"cd $REPO_NAME/$BRANCH && bun run runAkan script akan generateDocsSearch\""
                        script {
                            PROJECTS = ALL_PROJECTS.tokenize(",");
                            ALL_PROJECTS.tokenize(",").each { app -> 
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-server-env-$BRANCH", variable: "ENV")]) {
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/apps/$app/env/env.server.ts"        
                                }
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-server-env-testing", variable: "ENV")]) {
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/apps/$app/env/env.server.testing.ts"        
                                }
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-client-env-$BRANCH", variable: "ENV")]) {
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/apps/$app/env/env.client.ts"
                                }
                                withCredentials([file(credentialsId: "$REPO_NAME-$app-client-env-testing", variable: "ENV")]) {
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/apps/$app/env/env.client.testing.ts"
                                }
                            }
                            ALL_LIBS.tokenize(",").each { lib -> 
                                withCredentials([file(credentialsId: "$REPO_NAME-$lib-server-env-testing", variable: "ENV")]) {
                                    sh "ssh -i $SSH_KEY -p $BUILD_PORT $BUILD_USER@$BUILD_HOST \"mkdir -p ~/$REPO_NAME/$BRANCH/libs/$lib/env\""
                                    sh "scp -i $SSH_KEY -P $BUILD_PORT $ENV $BUILD_USER@$BUILD_HOST:~/$REPO_NAME/$BRANCH/libs/$lib/env/env.server.testing.ts"
                                }
                            }
                        }
                    }
                }
            }
        }
        stage("Build"){
            steps {
                script {
                    def builds = [:]
                    def maxConcurrentJobs = 4
                    PROJECTS.each { app -> 
                        builds["build-$app"] = {
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && bun run runAkan build $app\""
                        }
                    }
                    def totalJobs = builds.size()
                    def totalBranches = totalJobs / maxConcurrentJobs
                    def jobNames = builds.keySet()
                    def jobPlans = builds.values()
                    for (int branch = 0; branch < totalBranches; branch++) {
                        def start = branch * maxConcurrentJobs
                        def end = ((branch + 1) * maxConcurrentJobs < totalJobs ? (branch + 1) * maxConcurrentJobs : totalJobs) - 1
                        def jobs = [:]
                        (start..end).each { index ->
                            jobs[jobNames[index]] = jobPlans[index]
                        }
                        parallel jobs
                    }
                }
            }
        }
        stage("Typecheck"){
            steps {
                // `bun test` does not typecheck, so nothing used to notice API drift between the framework and
                // its own callers until a build broke — and 148 errors had accumulated behind that, including a
                // `refName` whose declared type disagreed with its runtime value and a type-level regression
                // guard that had silently stopped guarding. Tests included: they are where the drift shows.
                //
                // All three published packages, not just `akanjs`: `@akanjs/devkit` and `@akanjs/cli` were in no
                // gate at all, which is how 64 errors accumulated in them — among those a `.file` scan view whose
                // declared type said `string[]` where every reader called `.has()`, and a test file that had lost
                // its `bun:test` import and reported 20 errors from one line.
                sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && bun run typecheckPkgs\""
            }
        }
        stage("Test"){
            steps {
                // The framework unit suites, gating Dockerize and Deploy. `testPkgs` is the same command
                // developers run locally, so a red build here reproduces with one line and no Jenkins.
                //
                // Prepare Build has already run `bun install` and written AKAN_PUBLIC_REPO_NAME /
                // AKAN_PUBLIC_SERVE_DOMAIN / AKAN_PUBLIC_ENV into `.env`, which the cli suite needs:
                // 8 of its tests build temp workspaces through `WorkspaceExecutor.getBaseDevEnv`, which
                // throws without them.
                sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && bun run testPkgs\""
            }
        }
        stage("Dev Stability"){
            steps {
                // The 1113-line dev-host harness — the only coverage for the interlocked RSS-recycle, idle-suspend,
                // and builder-gap timers — ran nowhere automatically: `AKAN_DEV_STABILITY_INTEGRATION` is set by
                // this script alone, and nothing called it. `testPkgs` skips all 19 tests without it.
                //
                // Non-gating on purpose, for now. Each test boots a real dev server and several assert RSS
                // ceilings, so the suite is host-sensitive and budgets up to 180s per test; it has never run on
                // this host. Marking the build unstable puts the result in front of someone without letting a
                // first red measurement block a deploy. Promote it to a gating `sh` once it has been green here.
                catchError(buildResult: "UNSTABLE", stageResult: "FAILURE") {
                    timeout(time: 45, unit: "MINUTES") {
                        sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && bun run testDevStability\""
                    }
                }
            }
        }
        stage("Lib Suites"){
            steps {
                // TEST_LIBS in the default (single) database mode, with the testing credentials Prepare Build
                // fetched. Non-gating until they have been green here: `shared` still needs its lexical packages
                // and phone fixtures on this host.
                catchError(buildResult: "UNSTABLE", stageResult: "FAILURE") {
                    timeout(time: 20, unit: "MINUTES") {
                        script {
                            TEST_LIBS.tokenize(",").each { lib ->
                                sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && bun run runAkan test $lib\""
                            }
                        }
                    }
                }
            }
        }
        stage("Database Mode Conformance"){
            steps {
                // The same suites against Redis and Postgres (infra/test/compose.yaml, oldest and newest supported
                // versions), plus TEST_LIBS in multiple and cluster mode. A lib test counts only if it passed in
                // single mode, so what this host lacks for "Lib Suites" does not fail it; red means a mode regressed,
                // or a fixed defect still carries its `test.failing` marker.
                timeout(time: 30, unit: "MINUTES") {
                    sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && BRANCH=$BRANCH TEST_LIBS=$TEST_LIBS bun run testConformance --libs\""
                }
            }
        }
        stage("Dockerize"){
            steps {
                script {
                    def dockerizes = [:]
                    def maxConcurrentJobs = 6
                    PROJECTS.each { app -> 
                        dockerizes["$app"] = {
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH && mkdir -p ./dist/apps/$app \""
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH/dist/apps/$app && docker build . -t $REG_URL/$REPO_NAME/$app:$BRANCH-$env.BUILD_NUMBER\" --label=\"repo=$REPO_NAME\" --label=\"branch=$BRANCH\" --label=\"buildNum=$env.BUILD_NUMBER\""
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"docker image tag $REG_URL/$REPO_NAME/$app:$BRANCH-$env.BUILD_NUMBER $REG_URL/$REPO_NAME/$app:$BRANCH-live\""
                            sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"docker push $REG_URL/$REPO_NAME/$app:$BRANCH-live\""
                        }
                    }
                    def totalJobs = dockerizes.size()
                    def totalBranches = totalJobs / maxConcurrentJobs
                    def jobNames = dockerizes.keySet()
                    def jobPlans = dockerizes.values()
                    for (int branch = 0; branch < totalBranches; branch++) {
                        def start = branch * maxConcurrentJobs
                        def end = ((branch + 1) * maxConcurrentJobs < totalJobs ? (branch + 1) * maxConcurrentJobs : totalJobs) - 1
                        def jobs = [:]
                        (start..end).each { index ->
                            jobs[jobNames[index]] = jobPlans[index]
                        }
                        parallel jobs
                    }
                }
            }
        }
        stage("Deploy"){
            steps {
                script {
                    def deploys = [:]
                    def maxConcurrentJobs = 8
                    ALL_PROJECTS.tokenize(",").each { app -> 
                        if((PROJECTS).contains(app)) {
                            deploys[app] = {
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra && helm upgrade app ./app/ -f app/values/_common-values.yaml -f app/values/_common-secret.yaml -f app/values/$app-values.yaml -f app/values/$app-secret.yaml -i --create-namespace -n $app-$BRANCH --kubeconfig master/${app}.yaml\""
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra && kubectl rollout restart deployments/app-deployment -n $app-$BRANCH --kubeconfig master/${app}.yaml\""
                            }
                        } else {
                            deploys[app] = {
                                sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra && kubectl apply -f $BRANCH/${app}.yaml -n $app-$BRANCH --kubeconfig master/${app}.yaml\""
                            }
                        }
                    }
                    def totalJobs = deploys.size()
                    def totalBranches = totalJobs / maxConcurrentJobs
                    def jobNames = deploys.keySet()
                    def jobPlans = deploys.values()
                    for (int branch = 0; branch < totalBranches; branch++) {
                        def start = branch * maxConcurrentJobs
                        def end = ((branch + 1) * maxConcurrentJobs < totalJobs ? (branch + 1) * maxConcurrentJobs : totalJobs) - 1
                        def jobs = [:]
                        (start..end).each { index ->
                            jobs[jobNames[index]] = jobPlans[index]
                        }
                        parallel jobs
                    }
                }
            }
        }
        stage("Cleanup"){
            parallel {
                stage("Clean Master Registry"){
                    steps{
                        sh "ssh -i $SSH_KEY $MASTER_USER@$MASTER_HOST -p $MASTER_PORT \"cd $REPO_NAME/$BRANCH/infra/master/registry && chmod +x cleanup-registry.sh && ./cleanup-registry.sh\""
                    }
                }
                stage("Clean Build Registry"){
                    steps {
                        sh "ssh -i $SSH_KEY $BUILD_USER@$BUILD_HOST -p $BUILD_PORT \"cd $REPO_NAME/$BRANCH/infra/master/registry && chmod +x cleanup-agent.sh && ./cleanup-agent.sh $REG_URL/$REPO_NAME $BRANCH $env.BUILD_NUMBER\""
                    }
                }
            }
        }
    }
    post {
        failure {
            sh "echo 'Build Failed - $env.JOB_NAME $env.BUILD_NUMBER'"
            discordSend description: "Build Failed - $env.JOB_NAME $env.BUILD_NUMBER", link: env.BUILD_URL, result: currentBuild.currentResult, title: env.JOB_NAME, webhookURL: env.DISCORD_WEBHOOK
        }
        success {
            script {
                discordSend description: "Build Succeed - $env.JOB_NAME $env.BUILD_NUMBER", link: env.BUILD_URL, result: currentBuild.currentResult, title: env.JOB_NAME, webhookURL: env.DISCORD_WEBHOOK
            }
        }
    }
}
